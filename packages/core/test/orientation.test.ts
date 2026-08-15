import { describe, expect, it } from "vitest";

import {
  clampPetPosition,
  movePositionForArrowKey,
  resolvePetSide,
} from "../src/orientation.js";

describe("resolvePetSide", () => {
  it("does not flip while the pet remains in the midpoint band", () => {
    expect(
      resolvePetSide({
        previous: "left",
        petCenterX: 520,
        viewportWidth: 1000,
      }),
    ).toBe("left");
    expect(
      resolvePetSide({
        previous: "left",
        petCenterX: 560,
        viewportWidth: 1000,
      }),
    ).toBe("right");
    expect(
      resolvePetSide({
        previous: "right",
        petCenterX: 480,
        viewportWidth: 1000,
      }),
    ).toBe("right");
    expect(
      resolvePetSide({
        previous: "right",
        petCenterX: 440,
        viewportWidth: 1000,
      }),
    ).toBe("left");
  });

  it("uses a 32-pixel minimum hysteresis band on narrow viewports", () => {
    expect(
      resolvePetSide({
        previous: "left",
        petCenterX: 232,
        viewportWidth: 400,
      }),
    ).toBe("right");
  });
});

describe("position helpers", () => {
  it("clamps a pet inside viewport and safe-area bounds", () => {
    expect(
      clampPetPosition(
        { x: 900, y: -20 },
        {
          viewportWidth: 1000,
          viewportHeight: 700,
          petWidth: 192,
          petHeight: 208,
          safeArea: { top: 10, right: 20, bottom: 30, left: 40 },
        },
      ),
    ).toEqual({ x: 788, y: 10 });
  });

  it("keeps an oversized pet anchored at the available top-left", () => {
    expect(
      clampPetPosition(
        { x: 100, y: 100 },
        {
          viewportWidth: 120,
          viewportHeight: 100,
          petWidth: 192,
          petHeight: 208,
          safeArea: { top: 4, right: 4, bottom: 4, left: 4 },
        },
      ),
    ).toEqual({ x: 4, y: 4 });
  });

  it.each([
    ["ArrowLeft", { x: 2, y: 20 }],
    ["ArrowRight", { x: 18, y: 20 }],
    ["ArrowUp", { x: 10, y: 12 }],
    ["ArrowDown", { x: 10, y: 28 }],
  ])("moves for %s", (key, expected) => {
    expect(movePositionForArrowKey({ x: 10, y: 20 }, key, 8)).toEqual(expected);
  });

  it("ignores unrelated keys and invalid deltas", () => {
    expect(movePositionForArrowKey({ x: 10, y: 20 }, "Enter", 8)).toBeNull();
    expect(
      movePositionForArrowKey({ x: 10, y: 20 }, "ArrowLeft", Number.NaN),
    ).toBeNull();
  });

  it("preserves finite outputs across randomized inputs", () => {
    let seed = 0x5eed1234;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let index = 0; index < 10_000; index += 1) {
      const viewportWidth = 1 + random() * 4000;
      const viewportHeight = 1 + random() * 2200;
      const position = clampPetPosition(
        { x: random() * 10_000 - 5000, y: random() * 10_000 - 5000 },
        {
          viewportWidth,
          viewportHeight,
          petWidth: 192,
          petHeight: 208,
        },
      );
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
    }
  });
});
