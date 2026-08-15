import { PetHost } from "@t3code-pets/react";
import { useEffect, useState } from "react";

import { getT3PetStore, loadBundledRomeoPackage } from "./petRuntime.js";

export function T3PetsHost() {
  const [bundledPet, setBundledPet] = useState<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBundledRomeoPackage().then(
      (bytes) => {
        if (!cancelled) setBundledPet(bytes);
      },
      () => {
        if (!cancelled) setBundledPet(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return bundledPet ? (
    <PetHost bundledPet={bundledPet} store={getT3PetStore()} />
  ) : null;
}
