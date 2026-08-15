import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  PET_PACKAGE_LIMITS,
  readWebpDimensions,
  validatePetArchive,
} from "../../../packages/core/src/index.js";
import { buildRomeoPackage } from "../build.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("buildRomeoPackage", () => {
  it("builds deterministic validated bytes from both supplied atlases", async () => {
    const directory = await mkdtemp(join(tmpdir(), "t3code-pets-romeo-"));
    temporaryDirectories.push(directory);
    const firstPath = join(directory, "romeo-first.t3pet");
    const secondPath = join(directory, "romeo-second.t3pet");

    const first = await buildRomeoPackage(firstPath);
    const second = await buildRomeoPackage(secondPath);
    const firstBytes = new Uint8Array(await readFile(firstPath));
    const secondBytes = new Uint8Array(await readFile(secondPath));

    expect(first).toEqual(second);
    expect(firstBytes).toEqual(secondBytes);
    expect(first.bytes).toBeLessThan(PET_PACKAGE_LIMITS.maxCompressedBytes);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);

    const validated = await validatePetArchive(firstBytes);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.value.manifest).toMatchObject({
      id: "romeo-golden-british-shorthair",
      description:
        "Romeo, the golden British Shorthair, supports you throughout your work as a faithful workspace companion.",
      petVersion: "1.0.0",
      spriteVersionNumber: 2,
      timingProfile: "codex-v2",
    });
    for (const path of [
      validated.value.manifest.atlases.left,
      validated.value.manifest.atlases.right,
    ]) {
      const dimensions = readWebpDimensions(validated.value.files.get(path)!);
      expect(dimensions).toEqual({
        ok: true,
        value: {
          width: PET_PACKAGE_LIMITS.atlasWidth,
          height: PET_PACKAGE_LIMITS.atlasHeight,
        },
      });
    }
  }, 30_000);
});
