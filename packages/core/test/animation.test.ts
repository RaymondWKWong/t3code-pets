import { describe, expect, it } from "vitest";

import {
  quantizePointerDirection,
  resolvePetAnimationStateFrame,
  resolveAnimationFrame,
  resolveAnimationSequence,
} from "../src/animation.js";

describe("pet animation", () => {
  it("includes one idle break in the recurring working sequence", () => {
    const sequence = resolveAnimationSequence("working");

    expect(sequence.frames[0]).toEqual({
      row: 7,
      column: 0,
      durationMs: 120,
    });
    expect(sequence.frames[5]).toEqual({
      row: 7,
      column: 5,
      durationMs: 220,
    });
    expect(sequence.frames[18]).toEqual({
      row: 0,
      column: 0,
      durationMs: 1680,
    });
    expect(sequence.loopStartIndex).toBe(0);
  });

  it.each([
    ["idle", 0, 6, 0],
    ["working", 7, 24, 0],
    ["waiting-for-user", 6, 24, 0],
    ["success", 3, 18, 12],
    ["error", 5, 30, 24],
  ] as const)(
    "maps %s to row %i and then the standard idle loop",
    (activity, row, frameCount, loopStartIndex) => {
      const sequence = resolveAnimationSequence(activity);
      expect(sequence.frames[0]?.row).toBe(row);
      expect(sequence.frames).toHaveLength(frameCount);
      expect(sequence.loopStartIndex).toBe(loopStartIndex);
    },
  );

  it.each([
    ["working", 9_060, 7],
    ["waiting-for-user", 9_630, 6],
  ] as const)(
    "returns to the %s reaction after its idle break",
    (activity, elapsedMs, row) => {
      expect(resolveAnimationFrame({ activity, elapsedMs })).toMatchObject({
        row,
        column: 0,
      });
    },
  );

  it("resolves elapsed time at frame boundaries", () => {
    expect(
      resolveAnimationFrame({ activity: "working", elapsedMs: -10 }),
    ).toEqual({
      row: 7,
      column: 0,
      durationMs: 120,
    });
    expect(
      resolveAnimationFrame({ activity: "working", elapsedMs: 119 }),
    ).toEqual({
      row: 7,
      column: 0,
      durationMs: 120,
    });
    expect(
      resolveAnimationFrame({ activity: "working", elapsedMs: 120 }),
    ).toEqual({
      row: 7,
      column: 1,
      durationMs: 120,
    });
    expect(
      resolveAnimationFrame({ activity: "working", elapsedMs: 600 }),
    ).toEqual({
      row: 7,
      column: 5,
      durationMs: 220,
    });
    expect(
      resolveAnimationFrame({ activity: "working", elapsedMs: 2460 }),
    ).toEqual({
      row: 0,
      column: 0,
      durationMs: 1680,
    });
  });

  it("keeps very large elapsed times inside valid cells", () => {
    const frame = resolveAnimationFrame({
      activity: "error",
      elapsedMs: Number.MAX_SAFE_INTEGER,
    });
    expect(frame.row).toBeGreaterThanOrEqual(0);
    expect(frame.row).toBeLessThanOrEqual(10);
    expect(frame.column).toBeGreaterThanOrEqual(0);
    expect(frame.column).toBeLessThan(8);
  });
});

describe("quantizePointerDirection", () => {
  it("returns all sixteen clockwise directions starting at up", () => {
    for (let index = 0; index < 16; index += 1) {
      const radians = (index * Math.PI * 2) / 16;
      expect(
        quantizePointerDirection({
          dx: Math.sin(radians) * 100,
          dy: -Math.cos(radians) * 100,
          previous: 0,
        }),
      ).toBe(index);
    }
  });

  it("changes direction on either side of a sector boundary", () => {
    const boundary = Math.PI / 16;
    const vector = (radians: number) => ({
      dx: Math.sin(radians) * 100,
      dy: -Math.cos(radians) * 100,
      previous: 9,
    });
    expect(quantizePointerDirection(vector(boundary - 0.0001))).toBe(0);
    expect(quantizePointerDirection(vector(boundary + 0.0001))).toBe(1);
  });

  it("keeps the previous direction within the four-pixel dead zone", () => {
    expect(quantizePointerDirection({ dx: 2, dy: 2, previous: 7 })).toBe(7);
    expect(
      quantizePointerDirection({ dx: Number.NaN, dy: 1, previous: 7 }),
    ).toBe(7);
  });
});

describe("resolvePetAnimationStateFrame", () => {
  it("loops a direct running interaction without falling back to idle", () => {
    expect(
      resolvePetAnimationStateFrame({
        state: "running-right",
        elapsedMs: 1_059,
      }),
    ).toEqual({ row: 1, column: 7, durationMs: 220 });
    expect(
      resolvePetAnimationStateFrame({
        state: "running-right",
        elapsedMs: 1_060,
      }),
    ).toEqual({ row: 1, column: 0, durationMs: 120 });
    expect(
      resolvePetAnimationStateFrame({
        state: "running-right",
        elapsedMs: 10_600,
      }),
    ).toEqual({ row: 1, column: 0, durationMs: 120 });
  });

  it("uses the slow idle loop for direct idle rendering", () => {
    expect(
      resolvePetAnimationStateFrame({ state: "idle", elapsedMs: 1_680 }),
    ).toEqual({ row: 0, column: 1, durationMs: 660 });
  });
});
