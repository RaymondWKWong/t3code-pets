import { ensureBundledPet, PetsSettingsPanel } from "@t3code-pets/react";
import { useEffect, useState } from "react";

import { getT3PetStore, loadBundledRomeoPackage } from "./petRuntime.js";

export function T3PetsSettingsPage() {
  const [state, setState] = useState("loading");
  const store = getT3PetStore();

  useEffect(() => {
    let cancelled = false;
    void loadBundledRomeoPackage()
      .then((bytes) => ensureBundledPet(store, bytes))
      .then(
        () => {
          if (!cancelled) setState("ready");
        },
        (error: unknown) => {
          if (!cancelled) {
            setState(
              error instanceof Error
                ? error.message
                : "Romeo could not be loaded",
            );
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (state === "loading") return <p role="status">Loading pets…</p>;
  if (state !== "ready") return <p role="alert">{state}</p>;
  return <PetsSettingsPanel store={store} />;
}
