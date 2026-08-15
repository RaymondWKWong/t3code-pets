import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createIndexedDbPetStore,
  ensureBundledPet,
  type PetPreferences,
} from "../src/indexedDbPetStore.js";

const manifest = {
  schemaVersion: 1,
  id: "romeo-golden-british-shorthair",
  displayName: "Romeo - Golden British Shorthair",
  description:
    "Romeo, the golden British Shorthair, supports you throughout your work as a faithful workspace companion.",
  petVersion: "1.0.0",
  spriteVersionNumber: 2,
  atlases: {
    left: "spritesheet-left.webp",
    right: "spritesheet-right.webp",
  },
  thumbnail: "thumbnail.webp",
  timingProfile: "codex-v2",
} as const;

let indexedDb: IDBFactory;

beforeEach(() => {
  indexedDb = new IDBFactory();
});

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  view.setUint32(16, 10, true);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes.set(
    [
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
    ],
    20,
  );
  return bytes;
}

async function petPackage(version = "1.0.0"): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  const files = new Map<string, Uint8Array>([
    [
      "pet.json",
      new TextEncoder().encode(
        JSON.stringify({ ...manifest, petVersion: version }),
      ),
    ],
    ["spritesheet-left.webp", webp(1536, 2288)],
    ["spritesheet-right.webp", webp(1536, 2288)],
    ["thumbnail.webp", webp(192, 208)],
  ]);
  for (const [path, bytes] of files) {
    await writer.add(path, new Uint8ArrayReader(bytes), {
      level: 0,
      lastModDate: new Date("2000-01-01T00:00:00.000Z"),
    });
  }
  return writer.close();
}

const preferences: PetPreferences = {
  cursorCuriosity: true,
  enabled: true,
  petSize: 0.625,
  selectedPetId: "romeo-golden-british-shorthair",
  position: { x: 24, y: 48 },
};

describe("createIndexedDbPetStore", () => {
  it("returns stable first-launch preferences", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await expect(store.readPreferences()).resolves.toEqual({
      cursorCuriosity: true,
      enabled: true,
      petSize: 0.625,
      selectedPetId: null,
      position: null,
    });
  });

  it("migrates legacy size presets when reopening settings", async () => {
    await putRawPreferences(indexedDb, {
      enabled: false,
      petSize: "large",
      selectedPetId: null,
      position: { x: 10, y: 20 },
    });

    const store = createIndexedDbPetStore(indexedDb);
    await expect(store.readPreferences()).resolves.toEqual({
      cursorCuriosity: true,
      enabled: false,
      petSize: 0.625,
      selectedPetId: null,
      position: { x: 10, y: 20 },
    });
    await expect(readRawPreferences(indexedDb)).resolves.toMatchObject({
      petSize: 0.625,
    });
  });

  it("installs and reopens a validated package", async () => {
    const bytes = await petPackage();
    const store = createIndexedDbPetStore(indexedDb);

    await expect(store.install(bytes)).resolves.toMatchObject({
      id: manifest.id,
      petVersion: "1.0.0",
    });
    await store.writePreferences(preferences);

    const reopened = createIndexedDbPetStore(indexedDb);
    await expect(reopened.list()).resolves.toEqual([
      expect.objectContaining({ id: manifest.id, petVersion: "1.0.0" }),
    ]);
    await expect(reopened.get(manifest.id)).resolves.toMatchObject({
      manifest,
    });
    await expect(reopened.readPreferences()).resolves.toEqual(preferences);
  });

  it("replaces only with a higher semantic version", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage("1.0.0"));

    await expect(
      store.install(await petPackage("1.1.0")),
    ).resolves.toMatchObject({
      petVersion: "1.1.0",
    });
    await expect(
      store.install(await petPackage("0.9.0")),
    ).rejects.toMatchObject({
      code: "store.version_downgrade",
    });
    await expect(store.get(manifest.id)).resolves.toMatchObject({
      manifest: expect.objectContaining({ petVersion: "1.1.0" }),
    });
  });

  it("leaves the installed pet unchanged after invalid input", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage());

    await expect(
      store.install(new Uint8Array([1, 2, 3])),
    ).rejects.toMatchObject({
      code: "store.invalid_package",
    });
    await expect(store.get(manifest.id)).resolves.toMatchObject({ manifest });
  });

  it("clears selection only when the selected pet is removed", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage());
    await store.writePreferences(preferences);

    await store.remove("not-installed");
    await expect(store.readPreferences()).resolves.toEqual(preferences);

    await store.remove(manifest.id);
    await expect(store.readPreferences()).resolves.toEqual({
      ...preferences,
      selectedPetId: null,
    });
    await expect(store.list()).resolves.toEqual([]);
  });

  it("quarantines corrupt metadata while preserving valid pets", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage());
    await putRawPackage(indexedDb, { id: "corrupt", manifest: {} });
    await store.writePreferences({ ...preferences, selectedPetId: "corrupt" });

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ id: manifest.id }),
    ]);
    await expect(store.readPreferences()).resolves.toEqual({
      ...preferences,
      selectedPetId: null,
    });
  });

  it("bootstraps bundled Romeo without replacing a newer version", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage("2.0.0"));

    await expect(
      ensureBundledPet(store, await petPackage("1.0.0")),
    ).resolves.toMatchObject({ petVersion: "2.0.0" });
  });

  it("repairs legacy framework-versioned Romeo without allowing general downgrades", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage("1.2.4"));
    await store.writePreferences(preferences);

    await expect(
      ensureBundledPet(store, await petPackage("1.0.0")),
    ).resolves.toMatchObject({ petVersion: "1.0.0" });
    await expect(store.readPreferences()).resolves.toEqual(preferences);
    await expect(
      store.install(await petPackage("0.9.0")),
    ).rejects.toMatchObject({ code: "store.version_downgrade" });
  });

  it("compares complete hyphenated prerelease identifiers", async () => {
    const store = createIndexedDbPetStore(indexedDb);
    await store.install(await petPackage("1.0.0-alpha-beta"));

    await expect(
      ensureBundledPet(store, await petPackage("1.0.0-alpha-gamma")),
    ).resolves.toMatchObject({ petVersion: "1.0.0-alpha-gamma" });
  });
});

async function putRawPackage(
  factory: IDBFactory,
  value: unknown,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("t3code-pets", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = database.transaction("packages", "readwrite");
  transaction.objectStore("packages").put(value);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function putRawPreferences(
  factory: IDBFactory,
  value: unknown,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("t3code-pets", 1);
    request.onupgradeneeded = () => {
      const result = request.result;
      result.createObjectStore("packages", { keyPath: "id" });
      const assets = result.createObjectStore("assets", { keyPath: "key" });
      assets.createIndex("petId", "petId", { unique: false });
      result.createObjectStore("settings", { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = database.transaction("settings", "readwrite");
  transaction.objectStore("settings").put({ key: "preferences", value });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function readRawPreferences(factory: IDBFactory): Promise<unknown> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("t3code-pets", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const transaction = database.transaction("settings", "readonly");
  const request = transaction.objectStore("settings").get("preferences");
  const record = await new Promise<{ value: unknown } | undefined>(
    (resolve, reject) => {
      request.onsuccess = () => {
        const result: unknown = request.result;
        if (result === undefined) {
          resolve(undefined);
        } else if (
          result !== null &&
          typeof result === "object" &&
          "value" in result
        ) {
          resolve({ value: result.value });
        } else {
          reject(new Error("Stored preferences record is malformed"));
        }
      };
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return record?.value;
}
