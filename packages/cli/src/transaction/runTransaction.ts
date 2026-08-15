import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PlannedEdit } from "../compatibility/adapter.js";
import {
  atomicWriteOwnedFile,
  resolveSafeCheckoutPath,
  sha256FileOrNull,
  toBytes,
} from "./filesystem.js";
import { serializeJournal, serializeState } from "./journal.js";
import type {
  InstallationMetadata,
  InstallationState,
  ManagedFileState,
  TransactionJournal,
} from "./types.js";

export async function runTransaction(
  root: string,
  edits: readonly PlannedEdit[],
  validate: () => Promise<void>,
  metadata: InstallationMetadata,
  options: {
    readonly watchedPaths?: readonly string[];
  } = {},
): Promise<InstallationState> {
  const transactionId = randomUUID();
  const hadInstallationState =
    (await sha256FileOrNull(join(root, ".t3code-pets", "state.json"))) !== null;
  const managedFiles: ManagedFileState[] = [];
  for (const edit of edits) {
    const target = await resolveSafeCheckoutPath(root, edit.path);
    const current = await sha256FileOrNull(target);
    if (edit.kind === "create" && current !== null) {
      throw new Error(`Create target already exists: ${edit.path}`);
    }
    if (edit.kind === "modify" && current !== edit.expectedBeforeSha256) {
      throw new Error(`Modify target digest changed: ${edit.path}`);
    }
    const backupRelativePath =
      edit.kind === "modify"
        ? `.t3code-pets/backups/${transactionId}/${edit.path}`
        : null;
    if (backupRelativePath) {
      const backup = await resolveSafeCheckoutPath(root, backupRelativePath);
      await mkdir(dirname(backup), { recursive: true });
      await copyFile(target, backup);
    }
    managedFiles.push({
      path: edit.path,
      kind: edit.kind === "create" ? "created" : "modified",
      beforeSha256: current,
      afterSha256: "",
      backupRelativePath,
    });
  }

  const watchedFiles: ManagedFileState[] = [];
  const editPaths = new Set(edits.map((edit) => edit.path));
  for (const path of options.watchedPaths ?? []) {
    if (
      editPaths.has(path) ||
      watchedFiles.some((file) => file.path === path)
    ) {
      throw new Error(`Transaction path is duplicated: ${path}`);
    }
    const target = await resolveSafeCheckoutPath(root, path);
    const current = await sha256FileOrNull(target);
    const backupRelativePath = current
      ? `.t3code-pets/backups/${transactionId}/${path}`
      : null;
    if (backupRelativePath) {
      const backup = await resolveSafeCheckoutPath(root, backupRelativePath);
      await mkdir(dirname(backup), { recursive: true });
      await copyFile(target, backup);
    }
    watchedFiles.push({
      path,
      kind: current === null ? "created" : "modified",
      beforeSha256: current,
      afterSha256: "",
      backupRelativePath,
    });
  }

  const journalPath = ".t3code-pets/journal.json";
  const appliedPaths: string[] = [];
  const writeJournal = async () => {
    const journal: TransactionJournal = {
      schemaVersion: 1,
      transactionId,
      startedAt: new Date().toISOString(),
      metadata,
      files: [...managedFiles, ...watchedFiles],
      appliedPaths,
    };
    await writeInternalFile(root, journalPath, serializeJournal(journal));
  };
  await writeJournal();

  try {
    for (let index = 0; index < edits.length; index += 1) {
      const edit = edits[index]!;
      const file = managedFiles[index]!;
      const written = await atomicWriteOwnedFile({
        checkoutRoot: root,
        relativePath: edit.path,
        bytes: toBytes(edit.content),
        expectedCurrentSha256: file.beforeSha256,
      });
      managedFiles[index] = { ...file, afterSha256: written.sha256 };
      appliedPaths.push(edit.path);
      await writeJournal();
    }
    await validate();
    await captureWatchedFiles(root, watchedFiles, managedFiles, appliedPaths);
    await writeJournal();
    const state: InstallationState = {
      schemaVersion: 1,
      ...metadata,
      installedAt: new Date().toISOString(),
      files: managedFiles,
    };
    await writeInternalFile(
      root,
      ".t3code-pets/state.json",
      serializeState(state),
    );
    await rm(join(root, journalPath), { force: true });
    return state;
  } catch (error) {
    await captureWatchedFiles(root, watchedFiles, managedFiles, appliedPaths);
    const rollbackFailures = await rollback(root, managedFiles, appliedPaths);
    if (rollbackFailures.length === 0) {
      await rm(join(root, journalPath), { force: true });
      await rm(join(root, ".t3code-pets", "backups", transactionId), {
        recursive: true,
        force: true,
      });
      if (!hadInstallationState) {
        await removeEmptyOwnedDirectories(root, managedFiles);
      }
      throw error;
    }
    throw new TransactionRecoveryError(error, rollbackFailures);
  }
}

async function captureWatchedFiles(
  root: string,
  watchedFiles: readonly ManagedFileState[],
  managedFiles: ManagedFileState[],
  appliedPaths: string[],
): Promise<void> {
  for (const watched of watchedFiles) {
    if (managedFiles.some((file) => file.path === watched.path)) continue;
    const target = await resolveSafeCheckoutPath(root, watched.path);
    const current = await sha256FileOrNull(target);
    if (current === watched.beforeSha256) continue;
    managedFiles.push({ ...watched, afterSha256: current ?? "" });
    appliedPaths.push(watched.path);
  }
}

async function rollback(
  root: string,
  files: readonly ManagedFileState[],
  appliedPaths: readonly string[],
): Promise<readonly string[]> {
  const failures: string[] = [];
  for (const path of [...appliedPaths].reverse()) {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) continue;
    try {
      const target = await resolveSafeCheckoutPath(root, file.path);
      const current = await sha256FileOrNull(target);
      if (current !== file.afterSha256) {
        failures.push(`${file.path}: digest changed during rollback`);
        continue;
      }
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
    } catch (error) {
      failures.push(
        `${file.path}: ${error instanceof Error ? error.message : "rollback failed"}`,
      );
    }
  }
  return failures;
}

async function removeEmptyOwnedDirectories(
  root: string,
  files: readonly ManagedFileState[],
): Promise<void> {
  const directories = new Set<string>([".t3code-pets/backups", ".t3code-pets"]);
  for (const file of files) {
    if (file.kind !== "created") continue;
    let directory = dirname(file.path);
    while (directory !== "." && directory !== "") {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  for (const directory of [...directories].sort(
    (left, right) => right.length - left.length,
  )) {
    await rm(join(root, directory)).catch(() => undefined);
  }
}

async function writeInternalFile(
  root: string,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const target = await resolveSafeCheckoutPath(root, path);
  await mkdir(dirname(target), { recursive: true });
  const current = await sha256FileOrNull(target);
  await atomicWriteOwnedFile({
    checkoutRoot: root,
    relativePath: path,
    bytes,
    expectedCurrentSha256: current,
  });
}

export class TransactionRecoveryError extends Error {
  readonly rollbackFailures: readonly string[];

  constructor(cause: unknown, rollbackFailures: readonly string[]) {
    super(
      `Transaction failed and needs recovery: ${rollbackFailures.join("; ")}. Run t3code-pets recover.`,
      { cause },
    );
    this.name = "TransactionRecoveryError";
    this.rollbackFailures = rollbackFailures;
  }
}
