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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  InstalledPet,
  InstalledPetSummary,
  PetPreferences,
  PetStore,
} from "../src/petStore.js";
import { PetHost } from "../src/PetHost.js";

const manifest = {
  schemaVersion: 1,
  id: "romeo-golden-british-shorthair",
  displayName: "Romeo",
  description: "A cat.",
  petVersion: "1.0.0",
  spriteVersionNumber: 2,
  atlases: { left: "left.webp", right: "right.webp" },
  thumbnail: "thumbnail.webp",
  timingProfile: "codex-v2",
} as const;

class StubStore implements PetStore {
  preferences: PetPreferences = {
    cursorCuriosity: true,
    enabled: true,
    petSize: 0.5,
    selectedPetId: manifest.id,
    position: { x: 20, y: 30 },
  };
  readonly listeners = new Set<() => void>();
  readonly pet: InstalledPet = {
    manifest,
    files: new Map([
      ["pet.json", new Uint8Array([1])],
      ["left.webp", new Uint8Array([2])],
      ["right.webp", new Uint8Array([3, 3])],
      ["thumbnail.webp", new Uint8Array([4])],
    ]),
  };

  async list(): Promise<readonly InstalledPetSummary[]> {
    return [];
  }
  async get(): Promise<InstalledPet | null> {
    return this.pet;
  }
  async readAsset(): Promise<Uint8Array | null> {
    return null;
  }
  async install(): Promise<InstalledPetSummary> {
    throw new Error("Not used");
  }
  async remove(): Promise<void> {}
  async readPreferences(): Promise<PetPreferences> {
    return this.preferences;
  }
  async writePreferences(preferences: PetPreferences): Promise<void> {
    this.preferences = preferences;
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
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 42),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PetHost", () => {
  it("renders nothing when the pet store cannot be loaded", async () => {
    const store = new StubStore();
    vi.spyOn(store, "readPreferences").mockRejectedValue(
      new Error("Storage unavailable"),
    );

    const { container } = render(<PetHost store={store} />);
    await act(async () => undefined);

    expect(container).toBeEmptyDOMElement();
  });

  it("owns one bounded listener and animation-frame set", async () => {
    const store = new StubStore();
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const documentAdd = vi.spyOn(document, "addEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const { rerender, unmount } = render(<PetHost store={store} />);

    expect(
      await screen.findByRole("button", { name: "Move Romeo pet" }),
    ).toBeInTheDocument();
    rerender(<PetHost store={store} />);

    expect(
      windowAdd.mock.calls.filter(([event]) => event === "pointermove"),
    ).toHaveLength(1);
    expect(
      windowAdd.mock.calls.filter(([event]) => event === "resize"),
    ).toHaveLength(1);
    expect(
      documentAdd.mock.calls.filter(([event]) => event === "visibilitychange"),
    ).toHaveLength(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    unmount();
    expect(
      windowRemove.mock.calls.filter(([event]) => event === "pointermove"),
    ).toHaveLength(1);
    expect(
      windowRemove.mock.calls.filter(([event]) => event === "resize"),
    ).toHaveLength(1);
    expect(
      documentRemove.mock.calls.filter(
        ([event]) => event === "visibilitychange",
      ),
    ).toHaveLength(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("releases runtime resources when pets are disabled", async () => {
    const store = new StubStore();
    render(<PetHost store={store} />);
    await screen.findByRole("button", { name: "Move Romeo pet" });

    await act(async () => {
      store.preferences = { ...store.preferences, enabled: false };
      store.emit();
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Move Romeo pet" }),
      ).not.toBeInTheDocument();
    });
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  it("applies a persisted size change to the active pet", async () => {
    const store = new StubStore();
    render(<PetHost store={store} />);
    const sprite = await screen.findByRole("button", {
      name: "Move Romeo pet",
    });
    expect(sprite).toHaveStyle({ width: "96px", height: "104px" });

    await act(async () => {
      store.preferences = { ...store.preferences, petSize: 0.75 };
      store.emit();
    });

    await waitFor(() =>
      expect(sprite).toHaveStyle({ width: "144px", height: "156px" }),
    );
  });

  it("waves on hover, paw-punches on click, and hops in the live drag direction", async () => {
    let frameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frameCallback = callback;
        return 42;
      }),
    );
    vi.spyOn(performance, "now").mockReturnValue(0);
    const store = new StubStore();
    render(<PetHost store={store} />);
    const sprite = await screen.findByRole("button", {
      name: "Move Romeo pet",
    });

    fireEvent.pointerMove(sprite, {
      clientX: 80,
      clientY: 80,
      pointerId: 1,
    });
    act(() => frameCallback?.(120));
    act(() => frameCallback?.(400));
    expect(sprite).toHaveStyle({ backgroundPosition: "-192px -312px" });

    fireEvent.pointerDown(sprite, {
      clientX: 80,
      clientY: 80,
      pointerId: 1,
    });
    fireEvent.pointerUp(sprite, {
      clientX: 80,
      clientY: 80,
      pointerId: 1,
    });
    act(() => frameCallback?.(500));
    act(() => frameCallback?.(620));
    expect(sprite).toHaveStyle({ backgroundPosition: "-96px -728px" });

    fireEvent.pointerDown(sprite, {
      clientX: 80,
      clientY: 80,
      pointerId: 2,
    });
    fireEvent.pointerMove(sprite, {
      clientX: 100,
      clientY: 90,
      pointerId: 2,
    });
    act(() => frameCallback?.(1_400));
    act(() => frameCallback?.(1_540));
    expect(sprite).toHaveStyle({
      backgroundImage: 'url("blob:1")',
      backgroundPosition: "-96px -416px",
    });

    fireEvent.pointerMove(sprite, {
      clientX: 70,
      clientY: 95,
      pointerId: 2,
    });
    expect(sprite).toHaveStyle({ backgroundImage: 'url("blob:2")' });

    fireEvent.pointerUp(sprite, {
      clientX: 70,
      clientY: 95,
      pointerId: 2,
    });
    act(() => frameCallback?.(2_000));
    act(() => frameCallback?.(2_140));
    expect(sprite).toHaveStyle({ backgroundPosition: "-96px -312px" });
  });
});
