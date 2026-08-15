import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertOwnedGitStatus,
  parseGitStatusPorcelain,
} from "../src/checkout/gitState.js";
import { sha256Text } from "../src/compatibility/adapter.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("parseGitStatusPorcelain", () => {
  it("parses staged, unstaged, untracked, and conflicted paths", () => {
    const records = parseGitStatusPorcelain(
      "M  apps/web/package.json\0 M apps/web/src/a.ts\0?? local.txt\0UU conflict.ts\0",
    );
    expect(records).toEqual([
      { index: "M", worktree: " ", path: "apps/web/package.json" },
      { index: " ", worktree: "M", path: "apps/web/src/a.ts" },
      { index: "?", worktree: "?", path: "local.txt" },
      { index: "U", worktree: "U", path: "conflict.ts" },
    ]);
  });

  it("rejects malformed and rename records rather than guessing ownership", () => {
    expect(() => parseGitStatusPorcelain("broken\0")).toThrow();
    expect(() => parseGitStatusPorcelain("R  new.ts\0old.ts\0")).toThrow();
  });

  it("allows only fingerprinted installer-owned working-tree changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-git-state-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await writeFile(join(root, "apps", "web", "package.json"), "owned\n");
    await writeFile(join(root, "created.ts"), "created\n");
    const state = {
      schemaVersion: 1 as const,
      frameworkVersion: "1.0.0",
      adapterId: "test",
      t3Version: "0.0.33",
      t3Commit: "a".repeat(40),
      installedAt: new Date(0).toISOString(),
      files: [
        {
          path: "apps/web/package.json",
          kind: "modified" as const,
          beforeSha256: "b".repeat(64),
          afterSha256: sha256Text("owned\n"),
          backupRelativePath: ".t3code-pets/backups/a/apps/web/package.json",
        },
        {
          path: "created.ts",
          kind: "created" as const,
          beforeSha256: null,
          afterSha256: sha256Text("created\n"),
          backupRelativePath: null,
        },
      ],
    };

    await expect(
      assertOwnedGitStatus(root, state, [
        { index: " ", worktree: "M", path: "apps/web/package.json" },
        { index: "?", worktree: "?", path: "created.ts" },
      ]),
    ).resolves.toBeUndefined();

    await writeFile(join(root, "created.ts"), "user change\n");
    await expect(
      assertOwnedGitStatus(root, state, [
        { index: "?", worktree: "?", path: "created.ts" },
      ]),
    ).rejects.toMatchObject({
      code: "git.unowned_changes",
      paths: ["created.ts"],
    });
  });

  it("rejects staged, unowned, and case-colliding paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-git-state-"));
    temporaryDirectories.push(root);
    const records = [
      { index: "M", worktree: " ", path: "apps/web/package.json" },
      { index: "?", worktree: "?", path: "User.ts" },
      { index: "?", worktree: "?", path: "user.ts" },
    ] as const;
    await expect(
      assertOwnedGitStatus(root, null, records),
    ).rejects.toMatchObject({
      code: "git.unowned_changes",
    });
  });
});
