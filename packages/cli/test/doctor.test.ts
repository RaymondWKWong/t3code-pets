import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  doctorCommand,
  type DoctorDependencies,
} from "../src/commands/doctor.js";
import { runTransaction } from "../src/transaction/runTransaction.js";
import { FRAMEWORK_VERSION } from "../src/version.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("doctorCommand", () => {
  it("detects a changed managed file", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-doctor-"));
    temporaryDirectories.push(root);
    await runTransaction(
      root,
      [{ kind: "create", path: "owned.txt", content: "owned\n" }],
      async () => undefined,
      {
        frameworkVersion: FRAMEWORK_VERSION,
        adapterId: "t3-0.0.33",
        t3Version: "0.0.33",
        t3Commit: "a".repeat(40),
      },
    );
    const dependencies = createDependencies(root);
    expect((await doctorCommand({ t3Path: root }, dependencies)).healthy).toBe(
      true,
    );

    await writeFile(join(root, "owned.txt"), "user change\n");
    const report = await doctorCommand({ t3Path: root }, dependencies);
    expect(report.healthy).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "managed:owned.txt", status: "fail" }),
    );
    expect(await readFile(join(root, "owned.txt"), "utf8")).toBe(
      "user change\n",
    );
  });
});

function createDependencies(root: string): DoctorDependencies {
  return {
    detectCheckout: async () => ({
      root,
      t3Version: "0.0.33",
      t3Commit: "a".repeat(40),
      packageManager: "pnpm@11.10.0",
    }),
    readGitStatus: async () => [
      { index: "?", worktree: "?", path: "owned.txt" },
    ],
    selectAdapter: async () => ({
      id: "t3-0.0.33",
      t3Version: "0.0.33",
      inspect: async () => [],
      plan: async () => [],
    }),
  };
}
