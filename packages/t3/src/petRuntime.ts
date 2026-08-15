import { createIndexedDbPetStore, type PetStore } from "@t3code-pets/react";

let petStore: PetStore | null = null;
let bundledRomeoPromise: Promise<Uint8Array> | null = null;

export function getT3PetStore(): PetStore {
  petStore ??= createIndexedDbPetStore();
  return petStore;
}

export function loadBundledRomeoPackage(): Promise<Uint8Array> {
  bundledRomeoPromise ??= fetch(new URL("./romeo.t3pet", import.meta.url)).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(
          `Bundled Romeo package returned HTTP ${response.status}`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  );
  return bundledRomeoPromise;
}
