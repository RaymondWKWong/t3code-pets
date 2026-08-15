import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { InstallationState, TransactionJournal } from "./types.js";

export async function readInstallationState(
  root: string,
): Promise<InstallationState> {
  const path = join(root, ".t3code-pets", "state.json");
  const parsed = JSON.parse(
    await readFile(path, "utf8"),
  ) as Partial<InstallationState>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.frameworkVersion !== "string" ||
    typeof parsed.adapterId !== "string" ||
    typeof parsed.t3Version !== "string" ||
    typeof parsed.t3Commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(parsed.t3Commit) ||
    typeof parsed.installedAt !== "string" ||
    !Array.isArray(parsed.files) ||
    !parsed.files.every(isManagedFileState)
  ) {
    throw new Error("Unsupported or corrupt T3 Pets installation state");
  }
  const foldedPaths = parsed.files.map((file) =>
    file.path.toLocaleLowerCase("en-US"),
  );
  if (new Set(foldedPaths).size !== foldedPaths.length) {
    throw new Error("T3 Pets installation state contains duplicate paths");
  }
  return parsed as InstallationState;
}

export async function readTransactionJournal(
  root: string,
): Promise<TransactionJournal> {
  const path = join(root, ".t3code-pets", "journal.json");
  const parsed = JSON.parse(
    await readFile(path, "utf8"),
  ) as Partial<TransactionJournal>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.transactionId !== "string" ||
    typeof parsed.startedAt !== "string" ||
    !parsed.metadata ||
    !Array.isArray(parsed.files) ||
    !parsed.files.every(isJournalManagedFileState) ||
    !Array.isArray(parsed.appliedPaths) ||
    !parsed.appliedPaths.every(
      (value) => typeof value === "string" && isSafeRelativePath(value),
    )
  ) {
    throw new Error("Unsupported or corrupt T3 Pets transaction journal");
  }
  return parsed as TransactionJournal;
}

export function serializeState(state: InstallationState): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`);
}

export function serializeJournal(journal: TransactionJournal): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(journal, null, 2)}\n`);
}

function isManagedFileState(
  value: unknown,
): value is InstallationState["files"][number] {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  const path = file["path"];
  const kind = file["kind"];
  const before = file["beforeSha256"];
  const after = file["afterSha256"];
  const backup = file["backupRelativePath"];
  if (
    typeof path !== "string" ||
    !isSafeRelativePath(path) ||
    (kind !== "created" && kind !== "modified") ||
    !isSha256(after)
  ) {
    return false;
  }
  if (kind === "created") return before === null && backup === null;
  return (
    isSha256(before) &&
    typeof backup === "string" &&
    backup.startsWith(".t3code-pets/backups/") &&
    isSafeRelativePath(backup)
  );
}

function isJournalManagedFileState(
  value: unknown,
): value is TransactionJournal["files"][number] {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  if (file["afterSha256"] === "") {
    const path = file["path"];
    const kind = file["kind"];
    const before = file["beforeSha256"];
    const backup = file["backupRelativePath"];
    return (
      typeof path === "string" &&
      isSafeRelativePath(path) &&
      (kind === "created" || kind === "modified") &&
      (before === null || isSha256(before)) &&
      (backup === null ||
        (typeof backup === "string" &&
          backup.startsWith(".t3code-pets/backups/") &&
          isSafeRelativePath(backup)))
    );
  }
  return isManagedFileState(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSafeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    path
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}
