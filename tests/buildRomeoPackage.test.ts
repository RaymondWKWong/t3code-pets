import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validatePetArchive } from "@t3code-pets/core";
import { afterEach, describe, expect, it } from "vitest";

import { buildValidatedRomeoPackage } from "../scripts/build-romeo-package.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("buildValidatedRomeoPackage", () => {
  it("creates a fresh validated archive at the requested path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "t3pets-romeo-"));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, "nested", "romeo.t3pet");

    const built = await buildValidatedRomeoPackage(outputPath);
    const bytes = new Uint8Array(await readFile(outputPath));

    expect(built.bytes).toBe(bytes.byteLength);
    await expect(validatePetArchive(bytes)).resolves.toMatchObject({
      ok: true,
    });
  });
});
