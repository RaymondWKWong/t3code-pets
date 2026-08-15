#!/usr/bin/env node

import { parseArgs } from "node:util";

import { doctorCommand } from "./commands/doctor.js";
import { installCommand } from "./commands/install.js";
import { recoverCommand } from "./commands/recover.js";
import { t3UpdateCommand } from "./commands/t3Update.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { updateCommand } from "./commands/update.js";
import { withRestartNotice } from "./lifecycle.js";
import { FRAMEWORK_VERSION } from "./version.js";

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let json = false;
  try {
    const { positionals, values } = parseArgs({
      args: [...arguments_],
      allowPositionals: true,
      strict: true,
      options: {
        t3: { type: "string" },
        check: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        version: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
        remote: { type: "string" },
        branch: { type: "string" },
      },
    });
    json = values.json;
    if (values.version) {
      write(
        { version: FRAMEWORK_VERSION },
        json,
        `t3code-pets ${FRAMEWORK_VERSION}`,
      );
      return 0;
    }
    if (values.help || positionals.length === 0) {
      process.stdout.write(helpText());
      return positionals.length === 0 && !values.help ? 1 : 0;
    }
    if (positionals.length !== 1)
      throw new Error("Expected exactly one command");
    const command = positionals[0];
    const t3Path = values.t3 ?? process.cwd();

    if (command === "install") {
      const result = await installCommand({
        t3Path,
        ...(values.check ? { check: true } : {}),
      });
      write(
        result,
        json,
        withRestartNotice(
          `${result.status === "planned" ? "Would install" : result.status === "installed" ? "Installed" : "Already installed"} T3 Pets ${result.frameworkVersion} for T3 ${result.t3Version}\n${result.files.map((path) => `  ${path}`).join("\n")}`,
          result.status === "installed",
        ),
      );
      return 0;
    }

    if (command === "doctor") {
      if (values.check) throw new Error("--check is not supported by doctor");
      const report = await doctorCommand({ t3Path });
      write(
        report,
        json,
        report.checks
          .map(
            (check) =>
              `${check.status === "pass" ? "PASS" : "FAIL"} ${check.id}: ${check.message}`,
          )
          .join("\n"),
      );
      return report.healthy ? 0 : 1;
    }
    if (command === "update") {
      if (values.check) throw new Error("--check is not needed for update");
      const result = await updateCommand({ t3Path });
      write(
        result,
        json,
        withRestartNotice(
          result.status === "updated"
            ? `T3 Pets updated from ${result.previousFrameworkVersion} to ${result.frameworkVersion}`
            : `T3 Pets ${result.frameworkVersion} is up to date`,
          result.status === "updated",
        ),
      );
      return 0;
    }
    if (command === "t3-update") {
      const result = await t3UpdateCommand({
        t3Path,
        ...(values.remote ? { remote: values.remote } : {}),
        ...(values.branch ? { branch: values.branch } : {}),
        ...(values.check ? { check: true } : {}),
      });
      write(
        result,
        json,
        withRestartNotice(
          result.status === "up-to-date"
            ? "T3 is already up to date"
            : result.status === "available"
              ? `T3 update ${result.targetCommit.slice(0, 8)} is compatible and ready`
              : `Updated T3 to ${result.targetCommit.slice(0, 8)} and reinstalled Pets`,
          result.status === "updated",
        ),
      );
      return 0;
    }
    if (values.check) {
      throw new Error("--check is supported only by install and t3-update");
    }
    if (values.remote || values.branch) {
      throw new Error("--remote and --branch are supported only by t3-update");
    }
    if (command === "uninstall") {
      await uninstallCommand({ t3Path });
      write(
        { status: "uninstalled" },
        json,
        withRestartNotice("Uninstalled T3 Pets and restored T3 files", true),
      );
      return 0;
    }
    if (command === "recover") {
      const result = await recoverCommand({ t3Path });
      write(result, json, `Recovered transaction ${result.transactionId}`);
      return 0;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    const diagnostic = errorDiagnostic(error);
    if (json) process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
    else
      process.stderr.write(
        `T3 Pets failed: ${String(diagnostic["message"])}\n`,
      );
    return 1;
  }
}

function write(value: unknown, json: boolean, text: string): void {
  process.stdout.write(json ? `${JSON.stringify(value)}\n` : `${text}\n`);
}

function errorDiagnostic(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error))
    return { code: "unknown", message: String(error) };
  const details = error as Error & {
    readonly code?: string;
    readonly cause?: unknown;
    readonly path?: string;
    readonly paths?: readonly string[];
    readonly details?: Readonly<Record<string, unknown>>;
  };
  return {
    code: details.code ?? error.name,
    message: error.message,
    ...(details.path ? { path: details.path } : {}),
    ...(details.paths ? { paths: details.paths } : {}),
    ...(details.details ? { details: details.details } : {}),
    ...(details.cause !== undefined
      ? { cause: causeDiagnostic(details.cause) }
      : {}),
  };
}

function causeDiagnostic(cause: unknown): Record<string, unknown> {
  if (!(cause instanceof Error)) {
    return { code: "unknown", message: String(cause) };
  }
  const details = cause as Error & { readonly code?: string };
  return {
    code: details.code ?? cause.name,
    message: cause.message,
  };
}

function helpText(): string {
  return `t3code-pets ${FRAMEWORK_VERSION}\n\nUsage:\n  t3code-pets install [--check] [--t3 <path>] [--json]\n  t3code-pets doctor [--t3 <path>] [--json]\n  t3code-pets update [--t3 <path>] [--json]\n  t3code-pets t3-update [--check] [--remote <name>] [--branch <name>] [--t3 <path>] [--json]\n  t3code-pets uninstall [--t3 <path>] [--json]\n  t3code-pets recover [--t3 <path>] [--json]\n`;
}

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
