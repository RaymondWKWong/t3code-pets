import { describe, expect, it } from "vitest";

import { parsePetManifest } from "../src/manifest.js";

const validManifest = {
  schemaVersion: 1,
  id: "romeo-golden-british-shorthair",
  displayName: "Romeo - Golden British Shorthair",
  description: "An animated golden British Shorthair.",
  petVersion: "1.0.0",
  spriteVersionNumber: 2,
  atlases: {
    left: "spritesheet-left.webp",
    right: "spritesheet-right.webp",
  },
  thumbnail: "thumbnail.webp",
  timingProfile: "codex-v2",
} as const;

describe("parsePetManifest", () => {
  it("accepts a complete v1 manifest", () => {
    expect(parsePetManifest(validManifest)).toEqual({
      ok: true,
      value: validManifest,
    });
  });

  it.each([
    [{ ...validManifest, schemaVersion: 2 }, "schemaVersion"],
    [{ ...validManifest, spriteVersionNumber: 1 }, "spriteVersionNumber"],
    [{ ...validManifest, petVersion: "latest" }, "petVersion"],
    [
      {
        ...validManifest,
        atlases: { ...validManifest.atlases, left: "../left.webp" },
      },
      "atlases.left",
    ],
    [
      {
        ...validManifest,
        atlases: { ...validManifest.atlases, right: "folder/right.webp" },
      },
      "atlases.right",
    ],
    [{ ...validManifest, timingProfile: "custom" }, "timingProfile"],
  ])("rejects invalid manifests at %s", (input, path) => {
    const result = parsePetManifest(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path === path)).toBe(true);
    }
  });

  it("rejects unknown executable or remote-reference fields", () => {
    const result = parsePetManifest({
      ...validManifest,
      script: "https://example.com/pet.js",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "manifest.unrecognized_key" }),
      );
    }
  });
});
