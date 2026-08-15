// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePetAnimation } from "../src/usePetAnimation.js";

const baseInput = {
  activity: "idle" as const,
  cursorCuriosity: true,
  dragDirection: null,
  enabled: true,
  hovered: false,
  position: { x: 0, y: 0 },
  reducedMotion: false,
  spriteWidth: 96,
  spriteHeight: 104,
  activationRequestId: 0,
};

let nextFrame: FrameRequestCallback | null;

beforeEach(() => {
  vi.useFakeTimers();
  nextFrame = null;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 42;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function movePointer(x: number, y: number) {
  act(() => {
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: x, clientY: y }),
    );
  });
}

function tick(now: number) {
  const callback = nextFrame;
  if (!callback) throw new Error("Expected an animation frame callback");
  act(() => callback(now));
}

describe("usePetAnimation", () => {
  it("keeps the slow idle loop when cursor curiosity is paused", () => {
    const { result } = renderHook(() =>
      usePetAnimation({ ...baseInput, cursorCuriosity: false }),
    );

    movePointer(200, 200);
    tick(100);

    expect(result.current).toEqual({
      row: 0,
      column: 0,
      durationMs: 1_680,
    });
  });

  it("takes a bounded idle break after watching the cursor", () => {
    const { result } = renderHook(() => usePetAnimation(baseInput));

    movePointer(200, 200);
    tick(100);
    expect(result.current.row).toBeGreaterThanOrEqual(9);

    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    tick(8_100);
    expect(result.current.row).toBe(0);
  });

  it("keeps looping the waving row while hovered", () => {
    const { result } = renderHook(() =>
      usePetAnimation({ ...baseInput, hovered: true }),
    );

    tick(0);
    tick(280);

    expect(result.current).toEqual({
      row: 3,
      column: 2,
      durationMs: 140,
    });

    tick(1_680);

    expect(result.current).toEqual({
      row: 3,
      column: 2,
      durationMs: 140,
    });
  });

  it("keeps the drag animation clock while the pet position changes", () => {
    let input = { ...baseInput, dragDirection: "right" as const };
    const { result, rerender } = renderHook(() => usePetAnimation(input));

    tick(0);
    tick(240);
    expect(result.current).toEqual({
      row: 4,
      column: 1,
      durationMs: 140,
    });

    vi.mocked(performance.now).mockReturnValue(240);
    input = { ...input, position: { x: 40, y: 20 } };
    rerender();
    tick(360);

    expect(result.current).toEqual({
      row: 4,
      column: 2,
      durationMs: 140,
    });
  });
});
