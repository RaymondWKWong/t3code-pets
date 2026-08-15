import { describe, expect, it } from "vitest";

import {
  petSizeFromSliderStep,
  petSizeToDisplayPercentage,
  petSizeToSliderStep,
  resolvePetSizeMetrics,
  type PetSize,
} from "../src/petSize.js";

describe("pet size", () => {
  it.each([
    [0.25, { scale: 0.25, width: 48, height: 52 }],
    [0.625, { scale: 0.625, width: 120, height: 130 }],
    [0.75, { scale: 0.75, width: 144, height: 156 }],
    [1, { scale: 1, width: 192, height: 208 }],
  ] as const)("keeps scale %s aligned to whole pixels", (size, expected) => {
    expect(resolvePetSizeMetrics(size as PetSize)).toEqual(expected);
  });

  it("maps five-percent labels to whole-pixel scale steps", () => {
    expect(petSizeFromSliderStep(0)).toBe(0.25);
    expect(petSizeFromSliderStep(1)).toBe(0.3125);
    expect(petSizeFromSliderStep(6)).toBe(0.625);
    expect(petSizeFromSliderStep(12)).toBe(1);
    expect(petSizeToSliderStep(0.3125 as PetSize)).toBe(1);
    expect(petSizeToSliderStep(0.625 as PetSize)).toBe(6);
    expect(petSizeToSliderStep(1 as PetSize)).toBe(12);
    expect(petSizeToDisplayPercentage(0.25 as PetSize)).toBe(20);
    expect(petSizeToDisplayPercentage(0.625 as PetSize)).toBe(50);
    expect(petSizeToDisplayPercentage(1 as PetSize)).toBe(80);
  });
});
