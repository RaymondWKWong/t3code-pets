import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  PetStoreError,
  type InstalledPetSummary,
  type PetPreferences,
  type PetStore,
} from "./petStore.js";
import {
  maximumPetSizeStep,
  minimumPetSizeStep,
  petSizeFromSliderStep,
  petSizeToDisplayPercentage,
  petSizeToSliderStep,
  resolvePetSizeMetrics,
} from "./petSize.js";

const bundledRomeoId = "romeo-golden-british-shorthair";
const petSizeSaveDelayMs = 120;

interface SettingsData {
  readonly pets: readonly InstalledPetSummary[];
  readonly preferences: PetPreferences;
}

export function PetsSettingsPanel({ store }: { readonly store: PetStore }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [operation, setOperation] = useState<string | null>(null);
  const mounted = useRef(true);
  const latestPreferences = useRef<PetPreferences | null>(null);
  const pendingPetSize = useRef<number | null>(null);
  const petSizeSaveTimer = useRef<number | null>(null);
  const petSizeRevision = useRef(0);
  const preferencesWriteQueue = useRef<Promise<void>>(Promise.resolve());

  const enqueuePreferencesWrite = useCallback(
    (preferences: PetPreferences) => {
      const write = preferencesWriteQueue.current.then(() =>
        store.writePreferences(preferences),
      );
      preferencesWriteQueue.current = write.catch(() => undefined);
      return write;
    },
    [store],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [pets, preferences] = await Promise.all([
        store.list(),
        store.readPreferences(),
      ]);
      if (mounted.current) {
        const nextPreferences =
          pendingPetSize.current === null
            ? preferences
            : { ...preferences, petSize: pendingPetSize.current };
        latestPreferences.current = nextPreferences;
        setData({ pets, preferences: nextPreferences });
      }
    } catch (error) {
      if (mounted.current) {
        setLoadError(
          error instanceof Error ? error.message : "Pets could not be loaded",
        );
      }
    }
  }, [store]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const unsubscribe = store.subscribe(() => void load());
    return () => {
      mounted.current = false;
      if (petSizeSaveTimer.current !== null) {
        window.clearTimeout(petSizeSaveTimer.current);
      }
      unsubscribe();
    };
  }, [load, store]);

  const writePreferences = async (
    preferences: PetPreferences,
    message: string,
  ) => {
    if (petSizeSaveTimer.current !== null) {
      window.clearTimeout(petSizeSaveTimer.current);
      petSizeSaveTimer.current = null;
    }
    petSizeRevision.current += 1;
    pendingPetSize.current = null;
    latestPreferences.current = preferences;
    setOperation("preferences");
    setStatusMessage("");
    try {
      await enqueuePreferencesWrite(preferences);
      if (mounted.current) {
        setData((current) => (current ? { ...current, preferences } : current));
        setStatusMessage(message);
      }
    } catch (error) {
      if (mounted.current) setStatusMessage(errorMessage(error));
    } finally {
      if (mounted.current) setOperation(null);
    }
  };

  const handlePetSizeChange = (petSize: number) => {
    const current = latestPreferences.current ?? data?.preferences;
    if (!current) return;
    const preferences = { ...current, petSize };
    const revision = petSizeRevision.current + 1;
    petSizeRevision.current = revision;
    latestPreferences.current = preferences;
    pendingPetSize.current = petSize;
    setData((value) =>
      value
        ? { ...value, preferences: { ...value.preferences, petSize } }
        : value,
    );
    setStatusMessage("");
    if (petSizeSaveTimer.current !== null) {
      window.clearTimeout(petSizeSaveTimer.current);
    }
    petSizeSaveTimer.current = window.setTimeout(() => {
      petSizeSaveTimer.current = null;
      const queuedPreferences = latestPreferences.current;
      if (!queuedPreferences || !mounted.current) return;
      void enqueuePreferencesWrite(queuedPreferences)
        .then(() => {
          if (revision !== petSizeRevision.current) return;
          pendingPetSize.current = null;
          if (mounted.current) {
            setStatusMessage(
              `Pet size set to ${petSizeToDisplayPercentage(queuedPreferences.petSize)}%`,
            );
          }
        })
        .catch((error: unknown) => {
          if (revision !== petSizeRevision.current) return;
          pendingPetSize.current = null;
          if (mounted.current) setStatusMessage(errorMessage(error));
          void load();
        });
    }, petSizeSaveDelayMs);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setOperation("import");
    setStatusMessage("Installing pet…");
    try {
      const installed = await store.install(
        new Uint8Array(await file.arrayBuffer()),
      );
      setStatusMessage(`${installed.displayName} installed`);
      await load();
    } catch (error) {
      setStatusMessage(errorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  const handleRemove = async (pet: InstalledPetSummary) => {
    setOperation(`remove:${pet.id}`);
    setStatusMessage("");
    try {
      await store.remove(pet.id);
      setStatusMessage(`${pet.displayName} removed`);
      await load();
    } catch (error) {
      setStatusMessage(errorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  if (loadError) {
    return (
      <section
        aria-labelledby="pets-settings-title"
        className="t3pets-settings"
      >
        <h1 id="pets-settings-title">Pets</h1>
        <p role="alert">{loadError}</p>
        <button
          className="t3pets-secondary-button"
          onClick={() => void load()}
          type="button"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!data) {
    return (
      <section
        aria-labelledby="pets-settings-title"
        className="t3pets-settings"
      >
        <h1 id="pets-settings-title">Pets</h1>
        <p role="status">Loading pets…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="pets-settings-title" className="t3pets-settings">
      <header className="t3pets-settings-header">
        <div>
          <h1 id="pets-settings-title">Pets</h1>
          <p>Choose a companion that reacts while T3 works.</p>
        </div>
        <label className="t3pets-switch-row">
          <span>Pets enabled</span>
          <input
            aria-label="Pets enabled"
            checked={data.preferences.enabled}
            disabled={operation === "preferences"}
            onChange={(event) =>
              void writePreferences(
                { ...data.preferences, enabled: event.target.checked },
                event.target.checked ? "Pets enabled" : "Pets disabled",
              )
            }
            role="switch"
            type="checkbox"
          />
        </label>
      </header>

      <div aria-label="Pet behaviour" className="t3pets-preferences">
        <label className="t3pets-preference-row t3pets-size-row">
          <span className="t3pets-preference-copy">
            <strong>Pet size</strong>
            <span>Drag to resize Romeo in crisp pixel steps.</span>
          </span>
          <PetSizeControl
            disabled={operation === "preferences"}
            onChange={handlePetSizeChange}
            size={data.preferences.petSize}
          />
        </label>
        <label className="t3pets-preference-row">
          <span className="t3pets-preference-copy">
            <strong>Cursor curiosity</strong>
            <span>Sometimes watches the cursor, then takes a break.</span>
          </span>
          <input
            aria-label="Cursor curiosity"
            checked={data.preferences.cursorCuriosity}
            disabled={operation === "preferences"}
            onChange={(event) =>
              void writePreferences(
                {
                  ...data.preferences,
                  cursorCuriosity: event.target.checked,
                },
                event.target.checked
                  ? "Cursor curiosity enabled"
                  : "Cursor curiosity paused",
              )
            }
            role="switch"
            type="checkbox"
          />
        </label>
      </div>

      {data.pets.length === 0 ? (
        <div className="t3pets-empty">
          <p>No pets installed.</p>
          <p>Install a .t3pet package to add one.</p>
        </div>
      ) : (
        <ul aria-label="Installed pets" className="t3pets-list">
          {data.pets.map((pet) => {
            const selected = data.preferences.selectedPetId === pet.id;
            return (
              <li className="t3pets-card" key={pet.id}>
                <PetThumbnail pet={pet} store={store} />
                <div className="t3pets-card-copy">
                  <h2>{pet.displayName}</h2>
                  <p>{pet.description}</p>
                  <span>Version {pet.petVersion}</span>
                </div>
                <div className="t3pets-card-actions">
                  <button
                    aria-label={
                      selected
                        ? `${pet.displayName} selected`
                        : `Select ${pet.displayName}`
                    }
                    className="t3pets-primary-button"
                    disabled={selected || operation === "preferences"}
                    onClick={() =>
                      void writePreferences(
                        { ...data.preferences, selectedPetId: pet.id },
                        `${pet.displayName} selected`,
                      )
                    }
                    type="button"
                  >
                    {selected ? "Selected" : "Select"}
                  </button>
                  {pet.id !== bundledRomeoId ? (
                    <button
                      aria-label={`Remove ${pet.displayName}`}
                      className="t3pets-secondary-button"
                      disabled={operation === `remove:${pet.id}`}
                      onClick={() => void handleRemove(pet)}
                      type="button"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="t3pets-install-row">
        <div>
          <h2>Install a pet</h2>
          <p>Packages contain only local images and a manifest.</p>
        </div>
        <label className="t3pets-secondary-button">
          {operation === "import" ? "Installing…" : "Choose .t3pet"}
          <input
            accept=".t3pet,application/zip"
            aria-label="Install pet package"
            disabled={operation === "import"}
            onChange={(event) => void handleImport(event)}
            type="file"
          />
        </label>
      </footer>
      <div aria-live="polite" className="t3pets-status" role="status">
        {statusMessage}
      </div>
    </section>
  );
}

function PetThumbnail({
  pet,
  store,
}: {
  readonly pet: InstalledPetSummary;
  readonly store: PetStore;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void store.readAsset(pet.id, pet.thumbnailPath).then((bytes) => {
      if (!bytes || cancelled) return;
      objectUrl = URL.createObjectURL(
        new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/webp" }),
      );
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pet.id, pet.thumbnailPath, store]);

  return (
    <div className="t3pets-thumbnail-shell">
      {url ? (
        <img alt={`${pet.displayName} preview`} loading="lazy" src={url} />
      ) : (
        <span aria-hidden="true" className="t3pets-thumbnail-placeholder" />
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof PetStoreError && error.issues.length > 0) {
    return error.issues
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : "The pet operation failed";
}

function PetSizeControl({
  disabled,
  onChange,
  size,
}: {
  readonly disabled: boolean;
  readonly onChange: (size: number) => void;
  readonly size: number;
}) {
  const metrics = resolvePetSizeMetrics(size);
  const percentage = petSizeToDisplayPercentage(metrics.scale);
  const pixelWidth = Math.round(metrics.width);
  const pixelHeight = Math.round(metrics.height);
  return (
    <span className="t3pets-size-control">
      <input
        aria-label="Pet size"
        aria-valuetext={`${percentage}% (${pixelWidth} by ${pixelHeight} pixels)`}
        disabled={disabled}
        max={maximumPetSizeStep}
        min={minimumPetSizeStep}
        onChange={(event) =>
          onChange(petSizeFromSliderStep(Number(event.target.value)))
        }
        step={1}
        type="range"
        value={petSizeToSliderStep(size)}
      />
      <span aria-hidden="true" className="t3pets-size-value">
        {percentage}%
      </span>
    </span>
  );
}
