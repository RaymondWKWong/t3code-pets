import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
  type ZipWriterAddDataOptions,
} from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import { PET_PACKAGE_LIMITS } from "../src/manifest.js";
import { validatePetArchive } from "../src/archive.js";

const manifest = {
  schemaVersion: 1,
  id: "romeo-golden-british-shorthair",
  displayName: "Romeo - Golden British Shorthair",
  description: "Romeo faces into your workspace and reacts while T3 works.",
  petVersion: "1.0.0",
  spriteVersionNumber: 2,
  atlases: {
    left: "spritesheet-left.webp",
    right: "spritesheet-right.webp",
  },
  thumbnail: "thumbnail.webp",
  timingProfile: "codex-v2",
} as const;

interface TestEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly options?: ZipWriterAddDataOptions;
}

function webp(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  payload.set([
    0,
    0,
    0,
    0,
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ]);
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  view.setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

function validEntries(): TestEntry[] {
  return [
    {
      path: "pet.json",
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    },
    {
      path: "spritesheet-left.webp",
      bytes: webp(
        PET_PACKAGE_LIMITS.atlasWidth,
        PET_PACKAGE_LIMITS.atlasHeight,
      ),
    },
    {
      path: "spritesheet-right.webp",
      bytes: webp(
        PET_PACKAGE_LIMITS.atlasWidth,
        PET_PACKAGE_LIMITS.atlasHeight,
      ),
    },
    { path: "thumbnail.webp", bytes: webp(192, 208) },
  ];
}

async function archive(entries: readonly TestEntry[]): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  for (const entry of entries) {
    await writer.add(entry.path, new Uint8ArrayReader(entry.bytes), {
      level: 0,
      lastModDate: new Date("2000-01-01T00:00:00.000Z"),
      ...entry.options,
    });
  }
  return writer.close();
}

async function expectIssue(
  entries: readonly TestEntry[],
  code: string,
): Promise<void> {
  const result = await validatePetArchive(await archive(entries));
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues).toContainEqual(expect.objectContaining({ code }));
  }
}

function replaceAscii(bytes: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) {
    throw new Error("Replacement strings must have equal lengths");
  }
  const output = bytes.slice();
  const source = new TextEncoder().encode(from);
  const replacement = new TextEncoder().encode(to);
  for (let offset = 0; offset <= output.length - source.length; offset += 1) {
    if (source.every((byte, index) => output[offset + index] === byte)) {
      output.set(replacement, offset);
    }
  }
  return output;
}

describe("validatePetArchive", () => {
  it("accepts exactly one inert manifest, two atlases, and a thumbnail", async () => {
    const bytes = await archive(validEntries());
    const result = await validatePetArchive(bytes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.manifest).toEqual(manifest);
      expect([...result.value.files.keys()].sort()).toEqual([
        "pet.json",
        "spritesheet-left.webp",
        "spritesheet-right.webp",
        "thumbnail.webp",
      ]);
      expect(result.value.compressedBytes).toBe(bytes.byteLength);
      expect(result.value.extractedBytes).toBeGreaterThan(0);
    }
  });

  it.each(["../thumbnail.webp", "/thumbnail.webp", "C:/thumbnail.webp"])(
    "rejects unsafe path %s",
    async (path) => {
      const entries = validEntries();
      entries[3] = { path, bytes: webp(192, 208) };
      await expectIssue(entries, "archive.path_traversal");
    },
  );

  it("rejects duplicate paths", async () => {
    const malformed = replaceAscii(
      await archive([
        ...validEntries(),
        { path: "dup.json", bytes: validEntries()[0]!.bytes },
      ]),
      "dup.json",
      "pet.json",
    );
    const result = await validatePetArchive(malformed);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "archive.duplicate_path" }),
      );
    }
  });

  it("rejects symbolic links", async () => {
    const entries = validEntries();
    entries[3] = {
      ...entries[3]!,
      options: { unixMode: 0o120777 },
    };
    await expectIssue(entries, "archive.symbolic_link");
  });

  it("rejects undeclared files", async () => {
    await expectIssue(
      [
        ...validEntries(),
        { path: "notes.txt", bytes: new TextEncoder().encode("hello") },
      ],
      "archive.unexpected_file",
    );
  });

  it("rejects more than sixteen entries before extraction", async () => {
    const extras = Array.from({ length: 13 }, (_, index) => ({
      path: `extra-${index}.txt`,
      bytes: new Uint8Array([index]),
    }));
    await expectIssue(
      [...validEntries(), ...extras],
      "archive.too_many_entries",
    );
  });

  it("rejects reported extraction over the package limit", async () => {
    const entries = validEntries();
    entries[3] = {
      path: "thumbnail.webp",
      bytes: new Uint8Array(PET_PACKAGE_LIMITS.maxExtractedBytes + 1),
      options: { level: 9 },
    };
    await expectIssue(entries, "archive.too_large_extracted");
  }, 30_000);

  it("rejects an input over the compressed package limit before parsing", async () => {
    const result = await validatePetArchive(
      new Uint8Array(PET_PACKAGE_LIMITS.maxCompressedBytes + 1),
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({ code: "archive.too_large_compressed" }),
      ],
    });
  });

  it("rejects an atlas with the wrong media signature", async () => {
    const entries = validEntries();
    entries[1] = { path: "spritesheet-left.webp", bytes: new Uint8Array(30) };
    await expectIssue(entries, "atlas.invalid_webp");
  });

  it("rejects an atlas with the wrong dimensions", async () => {
    const entries = validEntries();
    entries[2] = {
      path: "spritesheet-right.webp",
      bytes: webp(192, 208),
    };
    await expectIssue(entries, "atlas.invalid_dimensions");
  });
});
