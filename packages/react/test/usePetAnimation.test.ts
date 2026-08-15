import { describe, expect, it } from "vitest";

import {
  resolveCursorCuriosityDuration,
  resolvePetVisualFrame,
} from "../src/usePetAnimation.js";

const idleInput = {
  activity: "idle" as const,
  activityElapsedMs: 0,
  cursorDirection: null,
  directElapsedMs: 0,
  dragDirection: null,
  hovered: false,
  idleElapsedMs: 0,
  activationElapsedMs: null,
};

describe("resolvePetVisualFrame", () => {
  it("gives live dragging priority over every other animation source", () => {
    expect(
      resolvePetVisualFrame({
        ...idleInput,
        activity: "working",
        activationElapsedMs: 140,
        cursorDirection: 12,
        directElapsedMs: 140,
        dragDirection: "left",
        hovered: true,
      }),
    ).toEqual({ row: 4, column: 1, durationMs: 140 });
  });

  it("plays one click paw-punch before returning to the hover wave", () => {
    expect(
      resolvePetVisualFrame({
        ...idleInput,
        activationElapsedMs: 120,
        hovered: true,
      }),
    ).toEqual({ row: 7, column: 1, durationMs: 120 });
    expect(
      resolvePetVisualFrame({
        ...idleInput,
        activationElapsedMs: 820,
        directElapsedMs: 820,
        hovered: true,
      }),
    ).toEqual({ row: 3, column: 0, durationMs: 140 });
  });

  it("uses activity before cursor curiosity and cursor curiosity before idle", () => {
    expect(
      resolvePetVisualFrame({
        ...idleInput,
        activity: "working",
        cursorDirection: 12,
      }),
    ).toEqual({ row: 7, column: 0, durationMs: 120 });
    expect(
      resolvePetVisualFrame({ ...idleInput, cursorDirection: 12 }),
    ).toEqual({ row: 10, column: 4, durationMs: 120 });
    expect(resolvePetVisualFrame(idleInput)).toEqual({
      row: 0,
      column: 0,
      durationMs: 1_680,
    });
  });
});

describe("resolveCursorCuriosityDuration", () => {
  it("uses longer watching periods and bounded idle breaks", () => {
    expect(resolveCursorCuriosityDuration("watching", 0)).toBe(8_000);
    expect(resolveCursorCuriosityDuration("watching", 1)).toBe(16_000);
    expect(resolveCursorCuriosityDuration("resting", 0)).toBe(2_000);
    expect(resolveCursorCuriosityDuration("resting", 1)).toBe(5_000);
  });

  it("clamps invalid random samples", () => {
    expect(resolveCursorCuriosityDuration("watching", Number.NaN)).toBe(8_000);
    expect(resolveCursorCuriosityDuration("resting", 2)).toBe(5_000);
  });
});
