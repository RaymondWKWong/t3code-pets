import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";

import {
  PET_PACKAGE_LIMITS,
  parsePetManifest,
  readWebpDimensions,
  validatePetArchive,
} from "../../packages/core/src/index.js";

interface BuildEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const romeoDirectory = dirname(fileURLToPath(import.meta.url));
const fixedTimestamp = new Date("2000-01-01T00:00:00.000Z");

export async function buildRomeoPackage(
  outputPath: string,
): Promise<{ readonly sha256: string; readonly bytes: number }> {
  const entries = await readAndValidateRomeoEntries();
  const archive = await writeDeterministicZip(
    entries.toSorted((left, right) => left.path.localeCompare(right.path)),
  );
  const validated = await validatePetArchive(archive);
  if (!validated.ok) {
    throw new Error(
      `Built Romeo package failed validation: ${validated.issues
        .map((issue) => `${issue.code} ${issue.path}`.trim())
        .join(", ")}`,
    );
  }
  await atomicWrite(outputPath, archive);
  return { sha256: sha256(archive), bytes: archive.byteLength };
}

async function readAndValidateRomeoEntries(): Promise<readonly BuildEntry[]> {
  const paths = [
    "pet.json",
    "spritesheet-left.webp",
    "spritesheet-right.webp",
    "thumbnail.webp",
  ] as const;
  const entries = await Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: new Uint8Array(await readFile(join(romeoDirectory, path))),
    })),
  );

  const manifestBytes = entries.find(
    (entry) => entry.path === "pet.json",
  )?.bytes;
  if (!manifestBytes) throw new Error("Romeo manifest is missing");
  const manifestResult = parsePetManifest(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
    ) as unknown,
  );
  if (!manifestResult.ok) {
    throw new Error(
      `Romeo manifest is invalid: ${manifestResult.issues
        .map((issue) => issue.code)
        .join(", ")}`,
    );
  }

  for (const path of [
    manifestResult.value.atlases.left,
    manifestResult.value.atlases.right,
  ]) {
    const atlas = entries.find((entry) => entry.path === path)?.bytes;
    if (!atlas) throw new Error(`Romeo atlas is missing: ${path}`);
    const dimensions = readWebpDimensions(atlas);
    if (
      !dimensions.ok ||
      dimensions.value.width !== PET_PACKAGE_LIMITS.atlasWidth ||
      dimensions.value.height !== PET_PACKAGE_LIMITS.atlasHeight
    ) {
      throw new Error(`Romeo atlas has invalid dimensions: ${path}`);
    }
  }

  return entries;
}

async function writeDeterministicZip(
  entries: readonly BuildEntry[],
): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    bufferedWrite: true,
    dataDescriptor: false,
    extendedTimestamp: false,
    keepOrder: true,
    useUnicodeFileNames: false,
    useWebWorkers: false,
  });
  for (const entry of entries) {
    await writer.add(entry.path, new Uint8ArrayReader(entry.bytes), {
      bufferedWrite: true,
      dataDescriptor: false,
      extendedTimestamp: false,
      lastModDate: fixedTimestamp,
      level: 9,
      unixMode: 0o100644,
      useUnicodeFileNames: false,
    });
  }
  return writer.close();
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
