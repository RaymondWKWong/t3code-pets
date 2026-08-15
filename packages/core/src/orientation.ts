export type PetSide = "left" | "right";

export interface PetPosition {
  readonly x: number;
  readonly y: number;
}

export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PetPositionBounds {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly petWidth: number;
  readonly petHeight: number;
  readonly safeArea?: Partial<SafeAreaInsets>;
}

export function resolvePetSide(input: {
  readonly previous: PetSide;
  readonly petCenterX: number;
  readonly viewportWidth: number;
}): PetSide {
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const midpoint = viewportWidth / 2;
  const hysteresisHalfWidth = Math.max(32, viewportWidth * 0.04);
  const petCenterX = Number.isFinite(input.petCenterX)
    ? input.petCenterX
    : midpoint;

  if (input.previous === "left") {
    return petCenterX >= midpoint + hysteresisHalfWidth ? "right" : "left";
  }
  return petCenterX <= midpoint - hysteresisHalfWidth ? "left" : "right";
}

export function clampPetPosition(
  position: PetPosition,
  bounds: PetPositionBounds,
): PetPosition {
  const viewportWidth = finiteNonNegative(bounds.viewportWidth);
  const viewportHeight = finiteNonNegative(bounds.viewportHeight);
  const petWidth = finiteNonNegative(bounds.petWidth);
  const petHeight = finiteNonNegative(bounds.petHeight);
  const top = finiteNonNegative(bounds.safeArea?.top ?? 0);
  const right = finiteNonNegative(bounds.safeArea?.right ?? 0);
  const bottom = finiteNonNegative(bounds.safeArea?.bottom ?? 0);
  const left = finiteNonNegative(bounds.safeArea?.left ?? 0);
  const maximumX = Math.max(left, viewportWidth - right - petWidth);
  const maximumY = Math.max(top, viewportHeight - bottom - petHeight);

  return {
    x: clamp(Number.isFinite(position.x) ? position.x : left, left, maximumX),
    y: clamp(Number.isFinite(position.y) ? position.y : top, top, maximumY),
  };
}

export function movePositionForArrowKey(
  position: PetPosition,
  key: string,
  delta: number,
): PetPosition | null {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(delta) ||
    delta <= 0
  ) {
    return null;
  }

  switch (key) {
    case "ArrowLeft":
      return { x: position.x - delta, y: position.y };
    case "ArrowRight":
      return { x: position.x + delta, y: position.y };
    case "ArrowUp":
      return { x: position.x, y: position.y - delta };
    case "ArrowDown":
      return { x: position.x, y: position.y + delta };
    default:
      return null;
  }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
