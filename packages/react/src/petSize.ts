export type PetSize = number;

export interface PetSizeMetrics {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

const petSizesBySliderStep = [
  0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125, 0.875,
  0.9375, 1,
] as const;

export const minimumPetSizeStep = 0;
export const maximumPetSizeStep = petSizesBySliderStep.length - 1;
export const defaultPetSize: PetSize = 0.625;

const sourceWidth = 192;
const sourceHeight = 208;
const legacyPetSizes: Readonly<Record<string, PetSize>> = {
  small: 0.375,
  medium: 0.5,
  large: 0.625,
  "extra-large": 0.75,
};

export function petSizeFromSliderStep(step: number): PetSize {
  const normalizedStep = Math.min(
    maximumPetSizeStep,
    Math.max(minimumPetSizeStep, Math.round(step)),
  );
  return petSizesBySliderStep[normalizedStep]!;
}

export function petSizeToSliderStep(size: PetSize): number {
  let nearestStep = minimumPetSizeStep;
  for (
    let step = minimumPetSizeStep + 1;
    step <= maximumPetSizeStep;
    step += 1
  ) {
    if (
      Math.abs(petSizesBySliderStep[step]! - size) <=
      Math.abs(petSizesBySliderStep[nearestStep]! - size)
    ) {
      nearestStep = step;
    }
  }
  return nearestStep;
}

export function petSizeToDisplayPercentage(size: PetSize): number {
  return 20 + petSizeToSliderStep(size) * 5;
}

export function normalizePetSize(size: number): PetSize {
  return Number.isFinite(size)
    ? petSizeFromSliderStep(petSizeToSliderStep(size))
    : defaultPetSize;
}

export function readStoredPetSize(value: unknown): PetSize {
  if (typeof value === "number") return normalizePetSize(value);
  if (typeof value === "string" && value in legacyPetSizes) {
    return legacyPetSizes[value]!;
  }
  return defaultPetSize;
}

export function isPetSize(value: unknown): value is PetSize {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return petSizesBySliderStep.some((size) => size === value);
}

export function resolvePetSizeMetrics(size: PetSize): PetSizeMetrics {
  const scale = normalizePetSize(size);
  return {
    scale,
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}
