import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  atomicWriteOwnedFile,
  resolveSafeCheckoutPath,
  sha256FileOrNull,
} from "../transaction/filesystem.js";
import { readTransactionJournal } from "../transaction/journal.js";

export interface RecoveryResult {
  readonly status: "recovered";
  readonly transactionId: string;
  readonly restoredPaths: readonly string[];
}

export async function recoverCommand(options: {
  readonly t3Path: string;
}): Promise<RecoveryResult> {
  const journal = await readTransactionJournal(options.t3Path);
  const applied = new Set(journal.appliedPaths);
  const candidates = journal.files.filter(
    (file) => applied.has(file.path) || file.afterSha256 === "",
  );
  const restoredPaths: string[] = [];

  for (const file of [...candidates].reverse()) {
    const target = await resolveSafeCheckoutPath(options.t3Path, file.path);
    const current = await sha256FileOrNull(target);
    if (file.afterSha256 && current !== file.afterSha256) {
      throw new Error(
        `Recovery stopped because ${file.path} changed after interruption`,
      );
    }
    if (!file.afterSha256 && current === file.beforeSha256) continue;
    if (file.kind === "created") {
      await rm(target, { force: true });
    } else if (file.backupRelativePath) {
      const backup = await resolveSafeCheckoutPath(
        options.t3Path,
        file.backupRelativePath,
      );
      await atomicWriteOwnedFile({
        checkoutRoot: options.t3Path,
        relativePath: file.path,
        bytes: new Uint8Array(await readFile(backup)),
        expectedCurrentSha256: current,
      });
    } else {
      throw new Error(`Recovery backup is missing for ${file.path}`);
    }
    restoredPaths.push(file.path);
  }

  await rm(join(options.t3Path, ".t3code-pets", "journal.json"), {
    force: true,
  });
  await rm(
    join(options.t3Path, ".t3code-pets", "backups", journal.transactionId),
    { recursive: true, force: true },
  );
  return {
    status: "recovered",
    transactionId: journal.transactionId,
    restoredPaths,
  };
}
