import {
  parsePetManifest,
  validatePetArchive,
  type PetManifestV1,
  type ValidatedPetPackage,
} from "@t3code-pets/core";

import {
  PetStoreError,
  type InstalledPet,
  type InstalledPetSummary,
  type PetInstallOptions,
  type PetPreferences,
  type PetStore,
} from "./petStore.js";
import { defaultPetSize, isPetSize, readStoredPetSize } from "./petSize.js";

const databaseName = "t3code-pets";
const schemaVersion = 1;
const packagesStoreName = "packages";
const assetsStoreName = "assets";
const settingsStoreName = "settings";
const preferencesKey = "preferences";
const bundledRomeoId = "romeo-golden-british-shorthair";
const legacyFrameworkVersionedRomeo = new Set([
  "1.2.0",
  "1.2.1",
  "1.2.2",
  "1.2.3",
  "1.2.4",
]);

const defaultPreferences: PetPreferences = {
  cursorCuriosity: true,
  enabled: true,
  petSize: defaultPetSize,
  selectedPetId: null,
  position: null,
};

interface PackageRecord {
  readonly id: string;
  readonly manifest: unknown;
  readonly installedAt: number;
}

interface AssetRecord {
  readonly key: string;
  readonly petId: string;
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

interface SettingRecord {
  readonly key: string;
  readonly value: unknown;
}

export type { PetPreferences } from "./petStore.js";

export function createIndexedDbPetStore(
  indexedDb: IDBFactory = globalThis.indexedDB,
): PetStore {
  if (!indexedDb) {
    throw new PetStoreError(
      "store.indexeddb_unavailable",
      "IndexedDB is not available in this environment",
    );
  }
  return new IndexedDbPetStore(indexedDb);
}

export async function ensureBundledPet(
  store: PetStore,
  romeoBytes: Uint8Array,
): Promise<InstalledPetSummary> {
  const bundled = await validatePetArchiveOrThrow(romeoBytes);
  const current = await store.get(bundled.manifest.id);
  if (
    current &&
    bundled.manifest.id === bundledRomeoId &&
    bundled.manifest.petVersion === "1.0.0" &&
    legacyFrameworkVersionedRomeo.has(current.manifest.petVersion)
  ) {
    return store.install(romeoBytes, { allowVersionDowngrade: true });
  }
  if (
    current &&
    compareSemver(current.manifest.petVersion, bundled.manifest.petVersion) >= 0
  ) {
    return toSummary(current.manifest);
  }
  return store.install(romeoBytes);
}

class IndexedDbPetStore implements PetStore {
  readonly #indexedDb: IDBFactory;
  readonly #listeners = new Set<() => void>();

  constructor(indexedDb: IDBFactory) {
    this.#indexedDb = indexedDb;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async list(): Promise<readonly InstalledPetSummary[]> {
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(
        [packagesStoreName, settingsStoreName],
        "readwrite",
      );
      const done = transactionDone(transaction);
      const records = await requestResult<PackageRecord[]>(
        transaction.objectStore(packagesStoreName).getAll(),
      );
      const validManifests = records.flatMap((record) => {
        const result = parsePetManifest(record.manifest);
        return result.ok ? [result.value] : [];
      });
      const setting = await requestResult<SettingRecord | undefined>(
        transaction.objectStore(settingsStoreName).get(preferencesKey),
      );
      const preferences = parsePreferences(setting?.value);
      if (
        preferences.selectedPetId &&
        !validManifests.some(
          (manifest) => manifest.id === preferences.selectedPetId,
        )
      ) {
        transaction.objectStore(settingsStoreName).put({
          key: preferencesKey,
          value: { ...preferences, selectedPetId: null },
        } satisfies SettingRecord);
      }
      await done;
      return validManifests
        .map(toSummary)
        .toSorted((left, right) =>
          left.displayName.localeCompare(right.displayName),
        );
    } finally {
      database.close();
    }
  }

  async get(id: string): Promise<InstalledPet | null> {
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(
        [packagesStoreName, assetsStoreName],
        "readonly",
      );
      const done = transactionDone(transaction);
      const record = await requestResult<PackageRecord | undefined>(
        transaction.objectStore(packagesStoreName).get(id),
      );
      if (!record) {
        await done;
        return null;
      }
      const manifestResult = parsePetManifest(record.manifest);
      if (!manifestResult.ok) {
        await done;
        return null;
      }
      const assets = await requestResult<AssetRecord[]>(
        transaction.objectStore(assetsStoreName).index("petId").getAll(id),
      );
      await done;
      const files = new Map(
        assets.map((asset) => [
          asset.path,
          new Uint8Array(asset.bytes.slice(0)),
        ]),
      );
      const required = [
        "pet.json",
        manifestResult.value.atlases.left,
        manifestResult.value.atlases.right,
        manifestResult.value.thumbnail,
      ];
      if (required.some((path) => !files.has(path))) return null;
      return { manifest: manifestResult.value, files };
    } finally {
      database.close();
    }
  }

  async readAsset(id: string, path: string): Promise<Uint8Array | null> {
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(assetsStoreName, "readonly");
      const done = transactionDone(transaction);
      const record = await requestResult<AssetRecord | undefined>(
        transaction.objectStore(assetsStoreName).get(assetKey(id, path)),
      );
      await done;
      return record ? new Uint8Array(record.bytes.slice(0)) : null;
    } finally {
      database.close();
    }
  }

  async install(
    bytes: Uint8Array,
    options: PetInstallOptions = {},
  ): Promise<InstalledPetSummary> {
    const validated = await validatePetArchiveOrThrow(bytes);
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(
        [packagesStoreName, assetsStoreName],
        "readwrite",
      );
      const done = transactionDone(transaction);
      try {
        const packageStore = transaction.objectStore(packagesStoreName);
        const assetStore = transaction.objectStore(assetsStoreName);
        const currentRecord = await requestResult<PackageRecord | undefined>(
          packageStore.get(validated.manifest.id),
        );
        const currentManifest = currentRecord
          ? parsePetManifest(currentRecord.manifest)
          : null;
        if (currentManifest?.ok) {
          const comparison = compareSemver(
            validated.manifest.petVersion,
            currentManifest.value.petVersion,
          );
          if (comparison < 0 && !options.allowVersionDowngrade) {
            throw new PetStoreError(
              "store.version_downgrade",
              `Refusing to replace ${currentManifest.value.petVersion} with ${validated.manifest.petVersion}`,
            );
          }
          if (comparison === 0) {
            await done;
            return toSummary(currentManifest.value);
          }
        }

        const oldAssetKeys = await requestResult<IDBValidKey[]>(
          assetStore.index("petId").getAllKeys(validated.manifest.id),
        );
        for (const key of oldAssetKeys) assetStore.delete(key);
        packageStore.put({
          id: validated.manifest.id,
          manifest: validated.manifest,
          installedAt: Date.now(),
        } satisfies PackageRecord);
        for (const [path, assetBytes] of validated.files) {
          assetStore.put({
            key: assetKey(validated.manifest.id, path),
            petId: validated.manifest.id,
            path,
            bytes: toArrayBuffer(assetBytes),
          } satisfies AssetRecord);
        }
        await done;
        this.#emit();
        return toSummary(validated.manifest);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed after the last request.
        }
        await done.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async remove(id: string): Promise<void> {
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(
        [packagesStoreName, assetsStoreName, settingsStoreName],
        "readwrite",
      );
      const done = transactionDone(transaction);
      const assetStore = transaction.objectStore(assetsStoreName);
      const assetKeys = await requestResult<IDBValidKey[]>(
        assetStore.index("petId").getAllKeys(id),
      );
      for (const key of assetKeys) assetStore.delete(key);
      transaction.objectStore(packagesStoreName).delete(id);
      const settingsStore = transaction.objectStore(settingsStoreName);
      const setting = await requestResult<SettingRecord | undefined>(
        settingsStore.get(preferencesKey),
      );
      const preferences = parsePreferences(setting?.value);
      if (preferences.selectedPetId === id) {
        settingsStore.put({
          key: preferencesKey,
          value: { ...preferences, selectedPetId: null },
        } satisfies SettingRecord);
      }
      await done;
      this.#emit();
    } finally {
      database.close();
    }
  }

  async readPreferences(): Promise<PetPreferences> {
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(
        [packagesStoreName, settingsStoreName],
        "readwrite",
      );
      const done = transactionDone(transaction);
      const settingsStore = transaction.objectStore(settingsStoreName);
      const setting = await requestResult<SettingRecord | undefined>(
        settingsStore.get(preferencesKey),
      );
      let preferences = parsePreferences(setting?.value);
      let shouldPersistPreferences =
        setting !== undefined && storedPetSizeNeedsNormalization(setting.value);
      if (preferences.selectedPetId) {
        const selectedRecord = await requestResult<PackageRecord | undefined>(
          transaction
            .objectStore(packagesStoreName)
            .get(preferences.selectedPetId),
        );
        if (!selectedRecord || !parsePetManifest(selectedRecord.manifest).ok) {
          preferences = { ...preferences, selectedPetId: null };
          shouldPersistPreferences = true;
        }
      }
      if (shouldPersistPreferences) {
        settingsStore.put({
          key: preferencesKey,
          value: preferences,
        } satisfies SettingRecord);
      }
      await done;
      return preferences;
    } finally {
      database.close();
    }
  }

  async writePreferences(preferences: PetPreferences): Promise<void> {
    const value = requireValidPreferences(preferences);
    const database = await openDatabase(this.#indexedDb);
    try {
      const transaction = database.transaction(settingsStoreName, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(settingsStoreName).put({
        key: preferencesKey,
        value,
      } satisfies SettingRecord);
      await done;
      this.#emit();
    } finally {
      database.close();
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

async function validatePetArchiveOrThrow(
  bytes: Uint8Array,
): Promise<ValidatedPetPackage> {
  const validated = await validatePetArchive(bytes);
  if (!validated.ok) {
    throw new PetStoreError(
      "store.invalid_package",
      validated.issues.map((issue) => issue.message).join("; "),
      validated.issues,
    );
  }
  return validated.value;
}

function toSummary(manifest: PetManifestV1): InstalledPetSummary {
  return {
    id: manifest.id,
    displayName: manifest.displayName,
    description: manifest.description,
    petVersion: manifest.petVersion,
    thumbnailPath: manifest.thumbnail,
  };
}

function compareSemver(left: string, right: string): number {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    const difference =
      leftVersion.numbers[index]! - rightVersion.numbers[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;
  const length = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumber = /^\d+$/.test(leftIdentifier)
      ? Number(leftIdentifier)
      : null;
    const rightNumber = /^\d+$/.test(rightIdentifier)
      ? Number(rightIdentifier)
      : null;
    if (leftNumber !== null && rightNumber !== null) {
      return Math.sign(leftNumber - rightNumber);
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function parseSemver(version: string): {
  readonly numbers: readonly [number, number, number];
  readonly prerelease: readonly string[] | null;
} {
  const [withoutBuild] = version.split("+", 1);
  const prereleaseSeparator = withoutBuild!.indexOf("-");
  const numberPart =
    prereleaseSeparator === -1
      ? withoutBuild!
      : withoutBuild!.slice(0, prereleaseSeparator);
  const prereleasePart =
    prereleaseSeparator === -1
      ? null
      : withoutBuild!.slice(prereleaseSeparator + 1);
  const numbers = numberPart.split(".").map(Number);
  return {
    numbers: [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0],
    prerelease: prereleasePart ? prereleasePart.split(".") : null,
  };
}

function parsePreferences(value: unknown): PetPreferences {
  if (!value || typeof value !== "object") return defaultPreferences;
  const candidate = value as Partial<PetPreferences> & {
    readonly petSize?: unknown;
  };
  const position = candidate.position;
  return {
    cursorCuriosity:
      typeof candidate.cursorCuriosity === "boolean"
        ? candidate.cursorCuriosity
        : true,
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true,
    petSize: readStoredPetSize(candidate.petSize),
    selectedPetId:
      typeof candidate.selectedPetId === "string" ||
      candidate.selectedPetId === null
        ? candidate.selectedPetId
        : null,
    position:
      position &&
      typeof position === "object" &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.y)
        ? { x: position.x, y: position.y }
        : null,
  };
}

function storedPetSizeNeedsNormalization(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return !isPetSize((value as { readonly petSize?: unknown }).petSize);
}

function requireValidPreferences(value: PetPreferences): PetPreferences {
  if (
    typeof value.cursorCuriosity !== "boolean" ||
    typeof value.enabled !== "boolean" ||
    !isPetSize(value.petSize) ||
    !(
      typeof value.selectedPetId === "string" || value.selectedPetId === null
    ) ||
    (value.position !== null &&
      (!Number.isFinite(value.position.x) ||
        !Number.isFinite(value.position.y)))
  ) {
    throw new PetStoreError(
      "store.invalid_preferences",
      "Pet preferences are invalid",
    );
  }
  return {
    cursorCuriosity: value.cursorCuriosity,
    enabled: value.enabled,
    petSize: value.petSize,
    selectedPetId: value.selectedPetId,
    position: value.position ? { ...value.position } : null,
  };
}

function assetKey(id: string, path: string): string {
  return `${id}\0${path}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, schemaVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(packagesStoreName)) {
        database.createObjectStore(packagesStoreName, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(assetsStoreName)) {
        const assets = database.createObjectStore(assetsStoreName, {
          keyPath: "key",
        });
        assets.createIndex("petId", "petId", { unique: false });
      }
      if (!database.objectStoreNames.contains(settingsStoreName)) {
        database.createObjectStore(settingsStoreName, { keyPath: "key" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new PetStoreError(
          "store.database_blocked",
          "IndexedDB upgrade is blocked by another open connection",
        ),
      );
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
