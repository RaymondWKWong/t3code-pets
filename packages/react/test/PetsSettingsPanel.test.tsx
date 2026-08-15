// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PetsSettingsPanel } from "../src/PetsSettingsPanel.js";
import {
  PetStoreError,
  type InstalledPet,
  type InstalledPetSummary,
  type PetPreferences,
  type PetStore,
} from "../src/petStore.js";

const romeo: InstalledPetSummary = {
  id: "romeo-golden-british-shorthair",
  displayName: "Romeo",
  description: "Golden British Shorthair",
  petVersion: "1.0.0",
  thumbnailPath: "thumbnail.webp",
};
const pixel: InstalledPetSummary = {
  id: "pixel-dog",
  displayName: "Pixel",
  description: "A small dog",
  petVersion: "1.0.0",
  thumbnailPath: "thumbnail.webp",
};

class StubStore implements PetStore {
  pets: InstalledPetSummary[] = [romeo, pixel];
  preferences: PetPreferences = {
    cursorCuriosity: true,
    enabled: true,
    petSize: 0.625,
    selectedPetId: romeo.id,
    position: null,
  };
  readonly listeners = new Set<() => void>();
  installError: Error | null = null;
  listError: Error | null = null;
  readonly writePreferences = vi.fn(async (preferences: PetPreferences) => {
    this.preferences = preferences;
    this.emit();
  });
  readonly remove = vi.fn(async (id: string) => {
    this.pets = this.pets.filter((pet) => pet.id !== id);
    this.emit();
  });

  async list(): Promise<readonly InstalledPetSummary[]> {
    if (this.listError) throw this.listError;
    return this.pets;
  }
  async get(): Promise<InstalledPet | null> {
    return null;
  }
  async readAsset(): Promise<Uint8Array | null> {
    return new Uint8Array([1, 2, 3]);
  }
  async install(): Promise<InstalledPetSummary> {
    if (this.installError) throw this.installError;
    const installed = {
      id: "new-pet",
      displayName: "New Pet",
      description: "Imported pet",
      petVersion: "1.0.0",
      thumbnailPath: "thumbnail.webp",
    };
    this.pets.push(installed);
    this.emit();
    return installed;
  }
  async readPreferences(): Promise<PetPreferences> {
    return this.preferences;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:thumbnail"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PetsSettingsPanel", () => {
  it("shows the current pet and persists a single selection", async () => {
    const user = userEvent.setup();
    const store = new StubStore();
    render(<PetsSettingsPanel store={store} />);

    expect(
      await screen.findByRole("button", { name: "Romeo selected" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Select Pixel" }));

    expect(store.writePreferences).toHaveBeenCalledWith({
      ...store.preferences,
      selectedPetId: pixel.id,
    });
    expect(
      await screen.findByRole("button", { name: "Pixel selected" }),
    ).toBeDisabled();
  });

  it("enables and disables pets without losing the selection", async () => {
    const user = userEvent.setup();
    const store = new StubStore();
    render(<PetsSettingsPanel store={store} />);

    const enabled = await screen.findByRole("switch", { name: "Pets enabled" });
    await user.click(enabled);
    expect(store.writePreferences).toHaveBeenCalledWith({
      ...store.preferences,
      enabled: false,
    });
    expect(store.preferences.selectedPetId).toBe(romeo.id);
  });

  it("lets the user pause cursor curiosity without disabling the pet", async () => {
    const user = userEvent.setup();
    const store = new StubStore();
    const expected = { ...store.preferences, cursorCuriosity: false };
    render(<PetsSettingsPanel store={store} />);

    await user.click(
      await screen.findByRole("switch", { name: "Cursor curiosity" }),
    );

    expect(store.writePreferences).toHaveBeenCalledWith(expected);
    expect(store.preferences.enabled).toBe(true);
  });

  it("persists a crisp pet size from the draggable slider", async () => {
    const store = new StubStore();
    render(<PetsSettingsPanel store={store} />);

    const slider = await screen.findByRole("slider", { name: "Pet size" });
    vi.useFakeTimers();
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "12");
    expect(slider).toHaveValue("6");
    expect(slider).toHaveAttribute("aria-valuetext", "50% (120 by 130 pixels)");
    fireEvent.change(slider, { target: { value: "7" } });
    expect(slider).toHaveAttribute("aria-valuetext", "55% (132 by 143 pixels)");
    fireEvent.change(slider, { target: { value: "10" } });

    expect(store.writePreferences).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-valuetext", "70% (168 by 182 pixels)");
    await act(async () => vi.advanceTimersByTimeAsync(150));
    expect(store.writePreferences).toHaveBeenCalledWith({
      ...store.preferences,
      petSize: 0.875,
    });
    expect(store.writePreferences).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("serializes slow size saves and preserves the latest value", async () => {
    const store = new StubStore();
    const completions: Array<() => void> = [];
    store.writePreferences.mockImplementation(
      (preferences) =>
        new Promise<void>((resolve) => {
          completions.push(() => {
            store.preferences = preferences;
            store.emit();
            resolve();
          });
        }),
    );
    render(<PetsSettingsPanel store={store} />);

    const slider = await screen.findByRole("slider", { name: "Pet size" });
    vi.useFakeTimers();
    fireEvent.change(slider, { target: { value: "7" } });
    await act(async () => vi.advanceTimersByTimeAsync(120));
    expect(store.writePreferences).toHaveBeenCalledTimes(1);

    fireEvent.change(slider, { target: { value: "10" } });
    await act(async () => vi.advanceTimersByTimeAsync(120));
    expect(store.writePreferences).toHaveBeenCalledTimes(1);
    expect(slider).toHaveAttribute("aria-valuetext", "70% (168 by 182 pixels)");

    await act(async () => completions[0]?.());
    expect(store.writePreferences).toHaveBeenCalledTimes(2);
    expect(slider).toHaveAttribute("aria-valuetext", "70% (168 by 182 pixels)");

    await act(async () => completions[1]?.());
    expect(store.preferences.petSize).toBe(0.875);
    vi.useRealTimers();
  });

  it("protects bundled Romeo while allowing user pets to be removed", async () => {
    const user = userEvent.setup();
    const store = new StubStore();
    render(<PetsSettingsPanel store={store} />);

    await screen.findByText("Romeo");
    expect(screen.queryByRole("button", { name: "Remove Romeo" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove Pixel" }));
    expect(store.remove).toHaveBeenCalledWith(pixel.id);
    await waitFor(() => expect(screen.queryByText("Pixel")).toBeNull());
  });

  it("reports exact import issues and preserves the selected pet", async () => {
    const user = userEvent.setup();
    const store = new StubStore();
    store.installError = new PetStoreError(
      "store.invalid_package",
      "Invalid pet",
      [
        {
          code: "archive.path_traversal",
          path: "../bad.webp",
          message: "Archive paths must be safe root-level filenames",
        },
      ],
    );
    render(<PetsSettingsPanel store={store} />);
    await screen.findByText("Romeo");

    await user.upload(
      screen.getByLabelText("Install pet package"),
      new File([new Uint8Array([1, 2, 3])], "bad.t3pet", {
        type: "application/zip",
      }),
    );

    expect(
      await screen.findByText(
        "archive.path_traversal: Archive paths must be safe root-level filenames",
      ),
    ).toBeInTheDocument();
    expect(store.preferences.selectedPetId).toBe(romeo.id);
  });

  it("recovers from a list failure through an explicit retry", async () => {
    const user = userEvent.setup();
    const store = new StubStore();
    store.listError = new Error("Storage unavailable");
    render(<PetsSettingsPanel store={store} />);

    expect(await screen.findByText("Storage unavailable")).toBeInTheDocument();
    store.listError = null;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Romeo")).toBeInTheDocument();
  });
});
