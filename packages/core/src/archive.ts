import {
  Uint8ArrayReader,
  ZipReader,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";

import {
  PET_PACKAGE_LIMITS,
  parsePetManifest,
  type PetManifestV1,
} from "./manifest.js";
import type { ValidationResult } from "./result.js";
import { validationFailure } from "./result.js";
import { readWebpDimensions } from "./webp.js";

export interface ValidatedPetPackage {
  readonly manifest: PetManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly compressedBytes: number;
  readonly extractedBytes: number;
}

class ArchiveExtractionLimitError extends Error {}

export async function validatePetArchive(
  bytes: Uint8Array,
): Promise<ValidationResult<ValidatedPetPackage>> {
  if (bytes.byteLength > PET_PACKAGE_LIMITS.maxCompressedBytes) {
    return validationFailure(
      "archive.too_large_compressed",
      `Archive exceeds ${PET_PACKAGE_LIMITS.maxCompressedBytes} compressed bytes`,
    );
  }

  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    useWebWorkers: false,
    strictness: "strict",
    checkAmbiguity: true,
    checkOverlappingEntry: true,
    checkSignature: true,
  });

  try {
    const entries = await reader.getEntries();
    const metadataResult = inspectEntryMetadata(entries);
    if (!metadataResult.ok) {
      return metadataResult;
    }

    const petJsonEntry = metadataResult.value.get("pet.json");
    if (!petJsonEntry) {
      return validationFailure(
        "archive.missing_manifest",
        "Archive must contain pet.json",
        "pet.json",
      );
    }

    const extractedCounter = { value: 0 };
    const petJsonBytes = await extractEntry(petJsonEntry, extractedCounter);
    const manifestResult = parseManifestBytes(petJsonBytes);
    if (!manifestResult.ok) {
      return manifestResult;
    }

    const manifest = manifestResult.value;
    const requiredPaths = new Set([
      "pet.json",
      manifest.atlases.left,
      manifest.atlases.right,
      manifest.thumbnail,
    ]);
    if (requiredPaths.size !== 4) {
      return validationFailure(
        "manifest.duplicate_file_reference",
        "Manifest file references must be distinct",
      );
    }

    for (const path of metadataResult.value.keys()) {
      if (!requiredPaths.has(path)) {
        return validationFailure(
          "archive.unexpected_file",
          `Archive contains undeclared file ${path}`,
          path,
        );
      }
    }
    for (const path of requiredPaths) {
      if (!metadataResult.value.has(path)) {
        return validationFailure(
          "archive.missing_file",
          `Archive is missing declared file ${path}`,
          path,
        );
      }
    }

    const files = new Map<string, Uint8Array>([["pet.json", petJsonBytes]]);
    for (const path of [...requiredPaths].sort()) {
      if (path === "pet.json") continue;
      const entry = metadataResult.value.get(path);
      if (!entry) {
        return validationFailure(
          "archive.missing_file",
          `Archive is missing declared file ${path}`,
          path,
        );
      }
      files.set(path, await extractEntry(entry, extractedCounter));
    }

    for (const path of [manifest.atlases.left, manifest.atlases.right]) {
      const atlas = files.get(path);
      if (!atlas) {
        return validationFailure(
          "archive.missing_file",
          `Archive is missing declared atlas ${path}`,
          path,
        );
      }
      const dimensions = readWebpDimensions(atlas);
      if (!dimensions.ok) {
        return validationFailure(
          "atlas.invalid_webp",
          dimensions.issues[0]?.message ?? "Atlas is not a supported WebP file",
          path,
        );
      }
      if (
        dimensions.value.width !== PET_PACKAGE_LIMITS.atlasWidth ||
        dimensions.value.height !== PET_PACKAGE_LIMITS.atlasHeight
      ) {
        return validationFailure(
          "atlas.invalid_dimensions",
          `Atlas must be ${PET_PACKAGE_LIMITS.atlasWidth} by ${PET_PACKAGE_LIMITS.atlasHeight} pixels`,
          path,
        );
      }
    }

    const thumbnail = files.get(manifest.thumbnail);
    if (!thumbnail) {
      return validationFailure(
        "archive.missing_file",
        `Archive is missing declared thumbnail ${manifest.thumbnail}`,
        manifest.thumbnail,
      );
    }
    const thumbnailDimensions = readWebpDimensions(thumbnail);
    if (!thumbnailDimensions.ok) {
      return validationFailure(
        "thumbnail.invalid_webp",
        thumbnailDimensions.issues[0]?.message ??
          "Thumbnail is not a supported WebP file",
        manifest.thumbnail,
      );
    }
    if (
      thumbnailDimensions.value.width > PET_PACKAGE_LIMITS.atlasWidth ||
      thumbnailDimensions.value.height > PET_PACKAGE_LIMITS.atlasHeight
    ) {
      return validationFailure(
        "thumbnail.invalid_dimensions",
        "Thumbnail dimensions must not exceed the atlas dimensions",
        manifest.thumbnail,
      );
    }

    return {
      ok: true,
      value: {
        manifest,
        files,
        compressedBytes: bytes.byteLength,
        extractedBytes: extractedCounter.value,
      },
    };
  } catch (error) {
    if (error instanceof ArchiveExtractionLimitError) {
      return validationFailure(
        "archive.too_large_extracted",
        `Archive exceeds ${PET_PACKAGE_LIMITS.maxExtractedBytes} extracted bytes`,
      );
    }
    if (
      error instanceof Error &&
      "reason" in error &&
      error.reason === "duplicate filename"
    ) {
      return validationFailure(
        "archive.duplicate_path",
        "Archive contains a duplicate path",
      );
    }
    return validationFailure(
      "archive.invalid_zip",
      error instanceof Error ? error.message : "Archive could not be read",
    );
  } finally {
    await reader.close().catch(() => undefined);
  }
}

function inspectEntryMetadata(
  entries: readonly Entry[],
): ValidationResult<ReadonlyMap<string, FileEntry>> {
  if (entries.length > PET_PACKAGE_LIMITS.maxEntries) {
    return validationFailure(
      "archive.too_many_entries",
      `Archive may contain at most ${PET_PACKAGE_LIMITS.maxEntries} entries`,
    );
  }

  const files = new Map<string, FileEntry>();
  let extractedBytes = 0;
  for (const entry of entries) {
    const pathIssue = inspectArchivePath(entry.filename);
    if (pathIssue) {
      return validationFailure(
        "archive.path_traversal",
        pathIssue,
        entry.filename,
      );
    }
    if (files.has(entry.filename)) {
      return validationFailure(
        "archive.duplicate_path",
        `Archive contains duplicate path ${entry.filename}`,
        entry.filename,
      );
    }
    if (entry.directory) {
      return validationFailure(
        "archive.directory_entry",
        "Pet archives may not contain directories",
        entry.filename,
      );
    }
    if (isSymbolicLink(entry)) {
      return validationFailure(
        "archive.symbolic_link",
        "Pet archives may not contain symbolic links",
        entry.filename,
      );
    }
    if (entry.encrypted) {
      return validationFailure(
        "archive.encrypted_entry",
        "Pet archives may not contain encrypted files",
        entry.filename,
      );
    }
    if (entry.executable) {
      return validationFailure(
        "archive.executable_entry",
        "Pet archives may not contain executable files",
        entry.filename,
      );
    }
    if (!Number.isSafeInteger(entry.uncompressedSize)) {
      return validationFailure(
        "archive.invalid_size",
        "Archive entry has an invalid extracted size",
        entry.filename,
      );
    }
    extractedBytes += entry.uncompressedSize;
    if (extractedBytes > PET_PACKAGE_LIMITS.maxExtractedBytes) {
      return validationFailure(
        "archive.too_large_extracted",
        `Archive exceeds ${PET_PACKAGE_LIMITS.maxExtractedBytes} extracted bytes`,
      );
    }
    files.set(entry.filename, entry);
  }

  return { ok: true, value: files };
}

function inspectArchivePath(path: string): string | null {
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("/") ||
    path.includes("\0") ||
    path === "." ||
    path === ".." ||
    /^[A-Za-z]:/.test(path)
  ) {
    return "Archive paths must be safe root-level filenames";
  }
  return null;
}

function isSymbolicLink(entry: Entry): boolean {
  const unixMode =
    entry.unixMode ??
    entry.unixExternalUpper ??
    (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

async function extractEntry(
  entry: FileEntry,
  extractedCounter: { value: number },
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let entryBytes = 0;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      entryBytes += chunk.byteLength;
      extractedCounter.value += chunk.byteLength;
      if (extractedCounter.value > PET_PACKAGE_LIMITS.maxExtractedBytes) {
        throw new ArchiveExtractionLimitError();
      }
      chunks.push(chunk.slice());
    },
  });
  await entry.getData(writable, {
    checkAmbiguity: true,
    checkOverlappingEntry: true,
    checkSignature: true,
  });

  const bytes = new Uint8Array(entryBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseManifestBytes(
  bytes: Uint8Array,
): ValidationResult<PetManifestV1> {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parsePetManifest(JSON.parse(text) as unknown);
  } catch (error) {
    return validationFailure(
      "manifest.invalid_json",
      error instanceof Error ? error.message : "pet.json is not valid JSON",
      "pet.json",
    );
  }
}
