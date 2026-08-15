import { readFile, rm } from "node:fs/promises";

import {
  detectT3Checkout,
  type DetectedT3Checkout,
} from "../checkout/detect.js";
import {
  resolveCorepackProcess,
  runProcess,
  type ProcessResult,
} from "../checkout/process.js";
import {
  atomicWriteOwnedFile,
  resolveSafeCheckoutPath,
  sha256FileOrNull,
} from "../transaction/filesystem.js";
import { readInstallationState } from "../transaction/journal.js";
import type { InstallationState } from "../transaction/types.js";

export class UninstallError extends Error {
  readonly code: string;
  readonly paths: readonly string[];

  constructor(code: string, message: string, paths: readonly string[] = []) {
    super(message);
    this.name = "UninstallError";
    this.code = code;
    this.paths = paths;
  }
}

export interface UninstallDependencies {
  readonly detectCheckout: (path: string) => Promise<DetectedT3Checkout>;
  readonly runProcess: (
    executable: string,
    arguments_: readonly string[],
    cwd: string,
  ) => Promise<ProcessResult>;
}

const defaults: UninstallDependencies = {
  detectCheckout: detectT3Checkout,
  runProcess,
};

export async function uninstallCommand(
  options: { readonly t3Path: string; readonly runPostUninstall?: boolean },
  dependencies: UninstallDependencies = defaults,
): Promise<void> {
  const state = await readInstallationState(options.t3Path);
  await assertInstalledFingerprints(options.t3Path, state);
  await assertBackupFingerprints(options.t3Path, state);
  const installedBytes = new Map<string, Uint8Array>();
  for (const file of state.files) {
    const target = await resolveSafeCheckoutPath(options.t3Path, file.path);
    installedBytes.set(file.path, new Uint8Array(await readFile(target)));
  }

  try {
    await restoreOriginalFiles(options.t3Path, state);
    if (options.runPostUninstall !== false) {
      const checkout = await dependencies.detectCheckout(options.t3Path);
      await runPostUninstall(checkout, dependencies.runProcess);
    }
    await assertOriginalFingerprints(options.t3Path, state);
  } catch (error) {
    const rollbackFailures = await restoreInstalledFiles(
      options.t3Path,
      state,
      installedBytes,
    );
    if (rollbackFailures.length > 0) {
      throw new UninstallError(
        "uninstall.recovery_required",
        `Uninstall failed and recovery was incomplete: ${rollbackFailures.join("; ")}`,
        rollbackFailures,
      );
    }
    throw error;
  }

  const frameworkDirectory = await resolveSafeCheckoutPath(
    options.t3Path,
    ".t3code-pets",
  );
  await rm(frameworkDirectory, { recursive: true, force: true });
}

async function assertBackupFingerprints(
  root: string,
  state: InstallationState,
): Promise<void> {
  const corrupt: string[] = [];
  for (const file of state.files) {
    if (file.kind !== "modified" || !file.backupRelativePath) continue;
    const backup = await resolveSafeCheckoutPath(root, file.backupRelativePath);
    if ((await sha256FileOrNull(backup)) !== file.beforeSha256) {
      corrupt.push(file.path);
    }
  }
  if (corrupt.length > 0) {
    throw new UninstallError(
      "uninstall.corrupt_backup",
      `Original-file backups are missing or corrupt: ${corrupt.join(", ")}`,
      corrupt,
    );
  }
}

async function assertInstalledFingerprints(
  root: string,
  state: InstallationState,
): Promise<void> {
  const changed: string[] = [];
  for (const file of state.files) {
    const target = await resolveSafeCheckoutPath(root, file.path);
    if ((await sha256FileOrNull(target)) !== file.afterSha256)
      changed.push(file.path);
  }
  if (changed.length > 0) {
    throw new UninstallError(
      "uninstall.managed_file_changed",
      `Managed files changed: ${changed.join(", ")}`,
      changed,
    );
  }
}

async function restoreOriginalFiles(
  root: string,
  state: InstallationState,
): Promise<void> {
  for (const file of [...state.files].reverse()) {
    const target = await resolveSafeCheckoutPath(root, file.path);
    if (file.kind === "created") {
      await rm(target, { force: true });
    } else if (file.backupRelativePath) {
      const backup = await resolveSafeCheckoutPath(
        root,
        file.backupRelativePath,
      );
      await atomicWriteOwnedFile({
        checkoutRoot: root,
        relativePath: file.path,
        bytes: new Uint8Array(await readFile(backup)),
        expectedCurrentSha256: file.afterSha256,
      });
    }
  }
}

async function restoreInstalledFiles(
  root: string,
  state: InstallationState,
  installedBytes: ReadonlyMap<string, Uint8Array>,
): Promise<readonly string[]> {
  const failures: string[] = [];
  for (const file of state.files) {
    try {
      const target = await resolveSafeCheckoutPath(root, file.path);
      const current = await sha256FileOrNull(target);
      await atomicWriteOwnedFile({
        checkoutRoot: root,
        relativePath: file.path,
        bytes: installedBytes.get(file.path)!,
        expectedCurrentSha256: current,
      });
    } catch (error) {
      failures.push(`${file.path}: ${messageOf(error)}`);
    }
  }
  return failures;
}

async function assertOriginalFingerprints(
  root: string,
  state: InstallationState,
): Promise<void> {
  const changed: string[] = [];
  for (const file of state.files) {
    const target = await resolveSafeCheckoutPath(root, file.path);
    if ((await sha256FileOrNull(target)) !== file.beforeSha256)
      changed.push(file.path);
  }
  if (changed.length > 0) {
    throw new UninstallError(
      "uninstall.post_validation_changed_files",
      `Post-uninstall validation changed restored files: ${changed.join(", ")}`,
      changed,
    );
  }
}

async function runPostUninstall(
  checkout: DetectedT3Checkout,
  processRunner: UninstallDependencies["runProcess"],
): Promise<void> {
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(checkout.packageManager)) {
    throw new Error(
      `Unsupported T3 package manager: ${checkout.packageManager}`,
    );
  }
  const corepack = await resolveCorepackProcess();
  const invoke = (arguments_: readonly string[]) =>
    processRunner(
      corepack.executable,
      [...corepack.prefixArguments, checkout.packageManager, ...arguments_],
      checkout.root,
    );
  await invoke(["install", "--frozen-lockfile=false"]);
  await invoke(["--filter", "@t3tools/web", "build"]);
  await invoke(["--filter", "@t3tools/web", "typecheck"]);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "rollback failed";
}
