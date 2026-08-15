import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Text } from "../src/compatibility/adapter.js";
import { uninstallCommand } from "../src/commands/uninstall.js";
import { readInstallationState } from "../src/transaction/journal.js";
import { runTransaction } from "../src/transaction/runTransaction.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("uninstallCommand", () => {
  it("restores modified files and removes only owned created files", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-uninstall-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "existing.txt"), "before\n");
    await runTransaction(
      root,
      [
        {
          kind: "modify",
          path: "existing.txt",
          expectedBeforeSha256: sha256Text("before\n"),
          content: "after\n",
        },
        { kind: "create", path: "created.txt", content: "created\n" },
      ],
      async () => undefined,
      {
        frameworkVersion: "1.0.0",
        adapterId: "t3-0.0.33",
        t3Version: "0.0.33",
        t3Commit: "a".repeat(40),
      },
    );

    await uninstallCommand({ t3Path: root, runPostUninstall: false });
    await expect(readFile(join(root, "existing.txt"), "utf8")).resolves.toBe(
      "before\n",
    );
    await expect(
      readFile(join(root, "created.txt"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("stops before mutation when an owned file changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-uninstall-"));
    temporaryDirectories.push(root);
    await runTransaction(
      root,
      [{ kind: "create", path: "created.txt", content: "created\n" }],
      async () => undefined,
      {
        frameworkVersion: "1.0.0",
        adapterId: "t3-0.0.33",
        t3Version: "0.0.33",
        t3Commit: "a".repeat(40),
      },
    );
    await writeFile(join(root, "created.txt"), "user change\n");

    await expect(
      uninstallCommand({ t3Path: root, runPostUninstall: false }),
    ).rejects.toMatchObject({ code: "uninstall.managed_file_changed" });
    await expect(readFile(join(root, "created.txt"), "utf8")).resolves.toBe(
      "user change\n",
    );
  });

  it("stops before mutation when an original-file backup is corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-uninstall-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "existing.txt"), "before\n");
    await runTransaction(
      root,
      [
        {
          kind: "modify",
          path: "existing.txt",
          expectedBeforeSha256: sha256Text("before\n"),
          content: "after\n",
        },
      ],
      async () => undefined,
      {
        frameworkVersion: "1.0.0",
        adapterId: "t3-0.0.33",
        t3Version: "0.0.33",
        t3Commit: "a".repeat(40),
      },
    );
    const state = await readInstallationState(root);
    const backup = state.files[0]?.backupRelativePath;
    expect(backup).toBeTruthy();
    await writeFile(join(root, backup!), "corrupt\n");

    await expect(
      uninstallCommand({ t3Path: root, runPostUninstall: false }),
    ).rejects.toMatchObject({
      code: "uninstall.corrupt_backup",
      paths: ["existing.txt"],
    });
    await expect(readFile(join(root, "existing.txt"), "utf8")).resolves.toBe(
      "after\n",
    );
    await expect(readInstallationState(root)).resolves.toMatchObject({
      frameworkVersion: "1.0.0",
    });
  });
});
