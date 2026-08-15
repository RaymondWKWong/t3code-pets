import { sha256Bytes, sha256FileOrNull } from "../transaction/filesystem.js";
import { serializeState } from "../transaction/journal.js";
import type { InstallationState } from "../transaction/types.js";
import { runProcess } from "./process.js";

export interface GitStatusRecord {
  readonly index: string;
  readonly worktree: string;
  readonly path: string;
}

export function parseGitStatusPorcelain(
  output: string,
): readonly GitStatusRecord[] {
  if (output.length === 0) return [];
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const records: GitStatusRecord[] = [];
  for (const field of fields) {
    if (field.length < 4 || field[2] !== " ") {
      throw new Error("Malformed git status --porcelain=v1 -z output");
    }
    const index = field[0]!;
    const worktree = field[1]!;
    if (
      index === "R" ||
      index === "C" ||
      worktree === "R" ||
      worktree === "C"
    ) {
      throw new Error(
        "Rename and copy records require explicit ownership review",
      );
    }
    const path = field.slice(3);
    if (!path) throw new Error("Git status record has an empty path");
    records.push({ index, worktree, path });
  }
  return records;
}

export async function readGitStatus(
  root: string,
): Promise<readonly GitStatusRecord[]> {
  const result = await runProcess(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    root,
  );
  return parseGitStatusPorcelain(result.stdout);
}

export class GitOwnershipError extends Error {
  readonly code = "git.unowned_changes";
  readonly paths: readonly string[];

  constructor(paths: readonly string[]) {
    super(
      `Git checkout contains changes not owned by T3 Pets: ${paths.join(", ")}`,
    );
    this.name = "GitOwnershipError";
    this.paths = paths;
  }
}

export async function assertOwnedGitStatus(
  root: string,
  state: InstallationState | null,
  records: readonly GitStatusRecord[],
): Promise<void> {
  const rejected = new Set<string>();
  const pathsByCase = new Map<string, string>();
  const managedByPath = new Map(
    state?.files.map((file) => [file.path, file]) ?? [],
  );
  const internalByPath = new Map<string, string>();
  if (state) {
    internalByPath.set(
      ".t3code-pets/state.json",
      sha256Bytes(serializeState(state)),
    );
    for (const file of state.files) {
      if (file.backupRelativePath && file.beforeSha256) {
        internalByPath.set(file.backupRelativePath, file.beforeSha256);
      }
    }
  }

  for (const record of records) {
    const path = record.path.replaceAll("\\", "/");
    const folded = path.toLocaleLowerCase("en-US");
    const previousCase = pathsByCase.get(folded);
    if (previousCase && previousCase !== path) {
      rejected.add(previousCase);
      rejected.add(path);
    } else {
      pathsByCase.set(folded, path);
    }

    const managed = managedByPath.get(path);
    const internalDigest = internalByPath.get(path);
    if (internalDigest) {
      if (
        record.index !== "?" ||
        record.worktree !== "?" ||
        (await sha256FileOrNull(`${root}/${path}`)) !== internalDigest
      ) {
        rejected.add(path);
      }
      continue;
    }
    const statusMatches =
      managed?.kind === "created"
        ? record.index === "?" && record.worktree === "?"
        : managed?.kind === "modified"
          ? record.index === " " &&
            (record.worktree === "M" || record.worktree === "T")
          : false;
    if (!managed || !statusMatches) {
      rejected.add(path);
      continue;
    }
    if ((await sha256FileOrNull(`${root}/${path}`)) !== managed.afterSha256) {
      rejected.add(path);
    }
  }

  if (rejected.size > 0) {
    throw new GitOwnershipError([...rejected].sort());
  }
}
