// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadBundledRomeoPackage: vi.fn<() => Promise<Uint8Array>>(),
}));

vi.mock("../src/petRuntime.js", () => ({
  getT3PetStore: vi.fn(() => ({})),
  loadBundledRomeoPackage: mocks.loadBundledRomeoPackage,
}));

import { T3PetsHost } from "../src/T3PetsHost.js";

afterEach(() => {
  cleanup();
  mocks.loadBundledRomeoPackage.mockReset();
});

describe("T3PetsHost", () => {
  it("renders nothing when the bundled pet cannot be loaded", async () => {
    mocks.loadBundledRomeoPackage.mockRejectedValue(
      new Error("Bundled package unavailable"),
    );

    const { container } = render(<T3PetsHost />);
    await act(async () => undefined);

    expect(container).toBeEmptyDOMElement();
  });
});
