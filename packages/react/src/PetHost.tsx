import {
  clampPetPosition,
  resolvePetSide,
  type PetPosition,
  type PetSide,
} from "@t3code-pets/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getPetActivitySnapshot,
  subscribePetActivity,
} from "./activityStore.js";
import { ensureBundledPet } from "./indexedDbPetStore.js";
import { resolvePetSizeMetrics, type PetSizeMetrics } from "./petSize.js";
import { PetSprite } from "./PetSprite.js";
import type { InstalledPet, PetPreferences, PetStore } from "./petStore.js";
import { usePetAnimation } from "./usePetAnimation.js";

export interface PetHostProps {
  readonly store: PetStore;
  readonly bundledPet?: Uint8Array;
}

interface LoadedPet {
  readonly pet: InstalledPet;
  readonly preferences: PetPreferences;
}

export function PetHost({ store, bundledPet }: PetHostProps) {
  const [loaded, setLoaded] = useState<LoadedPet | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initialize = bundledPet
      ? ensureBundledPet(store, bundledPet).then(() => undefined)
      : Promise.resolve();
    const load = async () => {
      await initialize;
      const preferences = await store.readPreferences();
      const pet = preferences.selectedPetId
        ? await store.get(preferences.selectedPetId)
        : null;
      if (!cancelled) {
        setLoaded(preferences.enabled && pet ? { pet, preferences } : null);
      }
    };
    const safelyLoad = () => {
      void load().catch(() => {
        if (!cancelled) setLoaded(null);
      });
    };
    safelyLoad();
    const unsubscribe = store.subscribe(safelyLoad);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [bundledPet, store]);

  return loaded ? (
    <ActivePetHost key={loaded.pet.manifest.id} loaded={loaded} store={store} />
  ) : null;
}

function ActivePetHost({
  loaded,
  store,
}: {
  readonly loaded: LoadedPet;
  readonly store: PetStore;
}) {
  const [atlasUrls, setAtlasUrls] = useState<Readonly<
    Record<PetSide, string>
  > | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const metrics = resolvePetSizeMetrics(loaded.preferences.petSize);
  const [position, setPosition] = useState<PetPosition>(() =>
    initialPosition(loaded.preferences, viewport, metrics),
  );
  const [side, setSide] = useState<PetSide>(() =>
    position.x + metrics.width / 2 < viewport.width / 2 ? "left" : "right",
  );
  const [hovered, setHovered] = useState(false);
  const [dragDirection, setDragDirection] = useState<PetSide | null>(null);
  const [activationRequestId, setActivationRequestId] = useState(0);
  const preferencesRef = useRef(loaded.preferences);
  preferencesRef.current = loaded.preferences;
  const activity = useSyncExternalStore(
    subscribePetActivity,
    getPetActivitySnapshot,
    getPetActivitySnapshot,
  );
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const left = loaded.pet.files.get(loaded.pet.manifest.atlases.left);
    const right = loaded.pet.files.get(loaded.pet.manifest.atlases.right);
    if (!left || !right) return;
    const urls = {
      left: URL.createObjectURL(webpBlob(left)),
      right: URL.createObjectURL(webpBlob(right)),
    };
    setAtlasUrls(urls);
    return () => {
      URL.revokeObjectURL(urls.left);
      URL.revokeObjectURL(urls.right);
    };
  }, [loaded.pet]);

  useEffect(() => {
    const handleResize = () => {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport(nextViewport);
      setPosition((current) =>
        clampForViewport(current, nextViewport, metrics),
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [metrics.height, metrics.width]);

  useEffect(() => {
    setPosition((current) => clampForViewport(current, viewport, metrics));
  }, [metrics.height, metrics.width, viewport]);

  useEffect(() => {
    setSide((previous) =>
      resolvePetSide({
        previous,
        petCenterX: position.x + metrics.width / 2,
        viewportWidth: viewport.width,
      }),
    );
  }, [metrics.width, position.x, viewport.width]);

  const frame = usePetAnimation({
    activationRequestId,
    activity,
    cursorCuriosity: loaded.preferences.cursorCuriosity,
    dragDirection,
    enabled: true,
    hovered,
    position,
    reducedMotion,
    spriteWidth: metrics.width,
    spriteHeight: metrics.height,
  });
  const changePosition = useCallback(
    (next: PetPosition) =>
      setPosition(clampForViewport(next, viewport, metrics)),
    [metrics, viewport],
  );
  const commitPosition = useCallback(
    (next: PetPosition) => {
      const clamped = clampForViewport(next, viewport, metrics);
      setPosition(clamped);
      void store.writePreferences({
        ...preferencesRef.current,
        position: clamped,
      });
    },
    [metrics, store, viewport],
  );

  if (!atlasUrls) return null;
  return (
    <PetSprite
      atlasUrls={atlasUrls}
      dragDirection={dragDirection}
      frame={frame}
      name={loaded.pet.manifest.displayName}
      onActivate={() => setActivationRequestId((current) => current + 1)}
      onDragDirectionChange={setDragDirection}
      onHoverChange={setHovered}
      onPositionChange={changePosition}
      onPositionCommit={commitPosition}
      petSize={loaded.preferences.petSize}
      position={position}
      side={side}
    />
  );
}

function initialPosition(
  preferences: PetPreferences,
  viewport: { readonly width: number; readonly height: number },
  metrics: PetSizeMetrics,
): PetPosition {
  return clampForViewport(
    preferences.position ?? {
      x: 24,
      y: viewport.height - metrics.height - 24,
    },
    viewport,
    metrics,
  );
}

function clampForViewport(
  position: PetPosition,
  viewport: { readonly width: number; readonly height: number },
  metrics: PetSizeMetrics,
): PetPosition {
  return clampPetPosition(position, {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    petWidth: metrics.width,
    petHeight: metrics.height,
    safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
  });
}

function webpBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: "image/webp",
  });
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);
  return reduced;
}
