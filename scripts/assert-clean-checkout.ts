import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  runProcess as defaultRunProcess,
  type ProcessResult,
} from "../packages/cli/src/checkout/process.js";

type ProcessRunner = (
  executable: string,
  arguments_: readonly string[],
  cwd: string,
) => Promise<ProcessResult>;

export async function assertCleanCheckout(
  checkoutRoot: string,
  runProcess: ProcessRunner = defaultRunProcess,
): Promise<void> {
  const result = await runProcess(
    "git",
    ["status", "--porcelain"],
    checkoutRoot,
  );
  const status = result.stdout.trim();
  if (status) {
    throw new Error(
      `T3 checkout is not clean after uninstall: ${status.replace(/\s+/g, " ")}`,
    );
  }
}

if (isDirectRun()) {
  const checkoutRoot = process.argv[2];
  if (!checkoutRoot) throw new Error("Usage: assert-clean-checkout <path>");
  await assertCleanCheckout(checkoutRoot);
  process.stdout.write(`${checkoutRoot}\n`);
}

function isDirectRun(): boolean {
  const scriptPath = process.argv[1];
  return Boolean(
    scriptPath && pathToFileURL(resolve(scriptPath)).href === import.meta.url,
  );
}
