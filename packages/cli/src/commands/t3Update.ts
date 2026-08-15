import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readGitStatus, type GitStatusRecord } from "../checkout/gitState.js";
import { runProcess, type ProcessResult } from "../checkout/process.js";
import { readInstallationState } from "../transaction/journal.js";
import type { InstallationState } from "../transaction/types.js";
import { doctorCommand, type DoctorReport } from "./doctor.js";
import {
  installCommand,
  type InstallOptions,
  type InstallResult,
} from "./install.js";
import { uninstallCommand } from "./uninstall.js";

export interface T3UpdateOptions {
  readonly t3Path: string;
  readonly remote?: string;
  readonly branch?: string;
  readonly check?: boolean;
  readonly payloadRoot?: string;
}

export interface T3UpdateResult {
  readonly status: "up-to-date" | "available" | "updated";
  readonly previousCommit: string;
  readonly targetCommit: string;
}

export interface T3UpdateDependencies {
  readonly doctor: (options: {
    readonly t3Path: string;
    readonly payloadRoot?: string;
  }) => Promise<DoctorReport>;
  readonly install: (options: InstallOptions) => Promise<InstallResult>;
  readonly uninstall: (options: {
    readonly t3Path: string;
    readonly runPostUninstall?: boolean;
  }) => Promise<void>;
  readonly readState: (root: string) => Promise<InstallationState>;
  readonly readGitStatus: (root: string) => Promise<readonly GitStatusRecord[]>;
  readonly runProcess: (
    executable: string,
    arguments_: readonly string[],
    cwd: string,
  ) => Promise<ProcessResult>;
  readonly makeTemporaryDirectory: () => Promise<string>;
  readonly removeTemporaryDirectory: (path: string) => Promise<void>;
}

const defaults: T3UpdateDependencies = {
  doctor: doctorCommand,
  install: installCommand,
  uninstall: uninstallCommand,
  readState: readInstallationState,
  readGitStatus,
  runProcess,
  makeTemporaryDirectory: () => mkdtemp(join(tmpdir(), "t3code-pets-update-")),
  removeTemporaryDirectory: (path) =>
    rm(path, { recursive: true, force: true }),
};

export async function t3UpdateCommand(
  options: T3UpdateOptions,
  dependencies: T3UpdateDependencies = defaults,
): Promise<T3UpdateResult> {
  const remote = validateGitName(options.remote ?? "origin", "remote");
  const branch = validateGitName(options.branch ?? "main", "branch");
  const doctor = await dependencies.doctor({
    t3Path: options.t3Path,
    ...(options.payloadRoot ? { payloadRoot: options.payloadRoot } : {}),
  });
  if (!doctor.healthy) {
    throw new Error(
      `T3 update preflight failed: ${doctor.checks
        .filter((check) => check.status === "fail")
        .map((check) => `${check.id}: ${check.message}`)
        .join("; ")}`,
    );
  }
  const state = await dependencies.readState(options.t3Path);
  const previousCommit = state.t3Commit;
  await dependencies.runProcess(
    "git",
    ["fetch", "--prune", remote],
    options.t3Path,
  );
  const targetCommit = (
    await dependencies.runProcess(
      "git",
      ["rev-parse", `refs/remotes/${remote}/${branch}`],
      options.t3Path,
    )
  ).stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(targetCommit)) {
    throw new Error("Fetched T3 target did not resolve to a full commit SHA");
  }
  if (targetCommit === previousCommit) {
    return { status: "up-to-date", previousCommit, targetCommit };
  }
  await dependencies.runProcess(
    "git",
    ["merge-base", "--is-ancestor", previousCommit, targetCommit],
    options.t3Path,
  );

  const temporaryRoot = await dependencies.makeTemporaryDirectory();
  const temporaryCheckout = join(temporaryRoot, "checkout");
  try {
    await dependencies.runProcess(
      "git",
      ["worktree", "add", "--detach", temporaryCheckout, targetCommit],
      options.t3Path,
    );
    await dependencies.install({
      t3Path: temporaryCheckout,
      ...(options.check ? { check: true } : {}),
      ...(options.payloadRoot ? { payloadRoot: options.payloadRoot } : {}),
    });
  } finally {
    await dependencies
      .runProcess(
        "git",
        ["worktree", "remove", "--force", temporaryCheckout],
        options.t3Path,
      )
      .catch(() => undefined);
    await dependencies.removeTemporaryDirectory(temporaryRoot);
  }

  if (options.check) {
    return { status: "available", previousCommit, targetCommit };
  }

  await dependencies.uninstall({
    t3Path: options.t3Path,
    runPostUninstall: false,
  });
  try {
    await dependencies.runProcess(
      "git",
      ["merge", "--ff-only", targetCommit],
      options.t3Path,
    );
    await dependencies.install({
      t3Path: options.t3Path,
      ...(options.payloadRoot ? { payloadRoot: options.payloadRoot } : {}),
    });
  } catch (error) {
    const status = await dependencies.readGitStatus(options.t3Path);
    if (status.length > 0) {
      throw new Error(
        "T3 update failed and automatic rollback stopped because unowned changes appeared",
        { cause: error },
      );
    }
    try {
      await dependencies.runProcess(
        "git",
        ["reset", "--keep", previousCommit],
        options.t3Path,
      );
      await dependencies.install({
        t3Path: options.t3Path,
        ...(options.payloadRoot ? { payloadRoot: options.payloadRoot } : {}),
      });
    } catch (recoveryError) {
      throw new Error("T3 update and previous-version recovery both failed", {
        cause: recoveryError,
      });
    }
    throw error;
  }
  return { status: "updated", previousCommit, targetCommit };
}

export function validateGitName(value: string, label: string): string {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) ||
    value.includes("..") ||
    value.endsWith("/") ||
    value.includes("//")
  ) {
    throw new Error(`Invalid Git ${label}: ${value}`);
  }
  return value;
}
