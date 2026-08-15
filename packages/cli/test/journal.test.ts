import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Text } from "../src/compatibility/adapter.js";
import { runTransaction } from "../src/transaction/runTransaction.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("runTransaction", () => {
  it("reverses created and modified files when validation fails", async () => {
    const root = await createRoot();
    const original = "original\n";
    await writeFile(join(root, "existing.txt"), original);

    await expect(
      runTransaction(
        root,
        [
          {
            kind: "modify",
            path: "existing.txt",
            expectedBeforeSha256: sha256Text(original),
            content: "changed\n",
          },
          { kind: "create", path: "nested/created.txt", content: "created\n" },
        ],
        async () => {
          throw new Error("validation failed");
        },
        metadata,
      ),
    ).rejects.toThrow("validation failed");

    await expect(readFile(join(root, "existing.txt"), "utf8")).resolves.toBe(
      original,
    );
    await expect(
      readFile(join(root, "nested/created.txt"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes fingerprinted installation state only after validation", async () => {
    const root = await createRoot();
    await runTransaction(
      root,
      [{ kind: "create", path: "created.txt", content: "owned\n" }],
      async () => undefined,
      metadata,
    );

    const state = JSON.parse(
      await readFile(join(root, ".t3code-pets", "state.json"), "utf8"),
    ) as {
      readonly files: readonly {
        readonly path: string;
        readonly afterSha256: string;
      }[];
    };
    expect(state.files).toEqual([
      expect.objectContaining({
        path: "created.txt",
        afterSha256: sha256Text("owned\n"),
      }),
    ]);
  });

  it("tracks and restores validation-generated files", async () => {
    const root = await createRoot();
    await writeFile(join(root, "pnpm-lock.yaml"), "original lock\n");

    await expect(
      runTransaction(
        root,
        [{ kind: "create", path: "created.txt", content: "owned\n" }],
        async () => {
          await writeFile(join(root, "pnpm-lock.yaml"), "partial lock\n");
          throw new Error("build failed");
        },
        metadata,
        { watchedPaths: ["pnpm-lock.yaml"] },
      ),
    ).rejects.toThrow("build failed");

    await expect(readFile(join(root, "pnpm-lock.yaml"), "utf8")).resolves.toBe(
      "original lock\n",
    );
    await expect(
      readFile(join(root, "created.txt"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("records changed watched files in successful state", async () => {
    const root = await createRoot();
    await writeFile(join(root, "pnpm-lock.yaml"), "original lock\n");
    const state = await runTransaction(
      root,
      [],
      async () => {
        await writeFile(join(root, "pnpm-lock.yaml"), "installed lock\n");
      },
      metadata,
      { watchedPaths: ["pnpm-lock.yaml"] },
    );

    expect(state.files).toEqual([
      expect.objectContaining({
        path: "pnpm-lock.yaml",
        kind: "modified",
        beforeSha256: sha256Text("original lock\n"),
        afterSha256: sha256Text("installed lock\n"),
      }),
    ]);
  });
});

const metadata = {
  frameworkVersion: "1.0.0",
  adapterId: "t3-0.0.33",
  t3Version: "0.0.33",
  t3Commit: "78f462c4e18c8ea5e5037dc916389a3b72246025",
} as const;

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "t3code-pets-transaction-"));
  temporaryDirectories.push(root);
  await mkdir(root, { recursive: true });
  return root;
}
