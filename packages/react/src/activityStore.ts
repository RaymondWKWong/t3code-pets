import type { PetActivity } from "@t3code-pets/core";

export interface PetActivityStore {
  getSnapshot(): PetActivity;
  set(
    activity: PetActivity,
    options?: { readonly transientForMs?: number },
  ): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const precedence: Readonly<Record<PetActivity, number>> = {
  idle: 0,
  success: 1,
  working: 2,
  error: 3,
  "waiting-for-user": 4,
};

export function resolvePetActivity(
  activities: readonly PetActivity[],
): PetActivity {
  return activities.reduce<PetActivity>(
    (current, candidate) =>
      precedence[candidate] > precedence[current] ? candidate : current,
    "idle",
  );
}

export function createPetActivityStore(): PetActivityStore {
  let activity: PetActivity = "idle";
  let expiry: ReturnType<typeof setTimeout> | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => activity,
    set(nextActivity, options) {
      revision += 1;
      const currentRevision = revision;
      if (expiry !== null) clearTimeout(expiry);
      expiry = null;
      if (activity !== nextActivity) {
        activity = nextActivity;
        notify();
      }
      const transientForMs = options?.transientForMs;
      if (
        transientForMs !== undefined &&
        Number.isFinite(transientForMs) &&
        transientForMs > 0
      ) {
        expiry = setTimeout(() => {
          if (revision !== currentRevision) return;
          expiry = null;
          if (activity !== "idle") {
            activity = "idle";
            notify();
          }
        }, transientForMs);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (expiry !== null) clearTimeout(expiry);
      expiry = null;
      listeners.clear();
    },
  };
}

const sharedPetActivityStore = createPetActivityStore();

export function setPetActivity(
  activity: PetActivity,
  options?: { readonly transientForMs?: number },
): void {
  sharedPetActivityStore.set(activity, options);
}

export function subscribePetActivity(listener: () => void): () => void {
  return sharedPetActivityStore.subscribe(listener);
}

export function getPetActivitySnapshot(): PetActivity {
  return sharedPetActivityStore.getSnapshot();
}
