import {
  quantizePointerDirection,
  resolveAnimationFrame,
  resolvePetAnimationStateFrame,
  type PetActivity,
  type PetFrame,
  type PetPosition,
  type PetSide,
} from "@t3code-pets/core";
import { useEffect, useRef, useState } from "react";

export interface UsePetAnimationInput {
  readonly activity: PetActivity;
  readonly cursorCuriosity: boolean;
  readonly dragDirection: PetSide | null;
  readonly enabled: boolean;
  readonly hovered: boolean;
  readonly position: PetPosition;
  readonly reducedMotion: boolean;
  readonly spriteWidth: number;
  readonly spriteHeight: number;
  readonly activationRequestId: number;
}

export type CursorCuriosityPhase = "watching" | "resting";

export interface ResolvePetVisualFrameInput {
  readonly activity: PetActivity;
  readonly activityElapsedMs: number;
  readonly cursorDirection: number | null;
  readonly directElapsedMs: number;
  readonly dragDirection: PetSide | null;
  readonly hovered: boolean;
  readonly idleElapsedMs: number;
  readonly activationElapsedMs: number | null;
}

const clickActivationDurationMs = 820;

export function resolvePetVisualFrame(
  input: ResolvePetVisualFrameInput,
): PetFrame {
  if (input.dragDirection) {
    return resolvePetAnimationStateFrame({
      state: "jumping",
      elapsedMs: input.directElapsedMs,
    });
  }
  if (
    input.activationElapsedMs !== null &&
    input.activationElapsedMs >= 0 &&
    input.activationElapsedMs < clickActivationDurationMs
  ) {
    return resolvePetAnimationStateFrame({
      state: "running",
      elapsedMs: input.activationElapsedMs,
    });
  }
  if (input.hovered) {
    return resolvePetAnimationStateFrame({
      state: "waving",
      elapsedMs: input.directElapsedMs,
    });
  }
  if (input.activity !== "idle") {
    return resolveAnimationFrame({
      activity: input.activity,
      elapsedMs: input.activityElapsedMs,
    });
  }
  if (input.cursorDirection !== null) {
    const direction = ((Math.round(input.cursorDirection) % 16) + 16) % 16;
    return {
      row: direction < 8 ? 9 : 10,
      column: direction % 8,
      durationMs: 120,
    };
  }
  return resolvePetAnimationStateFrame({
    state: "idle",
    elapsedMs: input.idleElapsedMs,
  });
}

export function resolveCursorCuriosityDuration(
  phase: CursorCuriosityPhase,
  randomSample: number,
): number {
  const sample = Number.isFinite(randomSample)
    ? Math.min(1, Math.max(0, randomSample))
    : 0;
  const [minimum, maximum] =
    phase === "watching" ? [8_000, 16_000] : [2_000, 5_000];
  return Math.round(minimum + (maximum - minimum) * sample);
}

export function usePetAnimation(input: UsePetAnimationInput): PetFrame {
  const [frame, setFrame] = useState<PetFrame>(() =>
    resolveAnimationFrame({ activity: input.activity, elapsedMs: 0 }),
  );
  const [hidden, setHidden] = useState(() => document.hidden);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const position = useRef(input.position);
  position.current = input.position;
  const direction = useRef(0);
  const activationStart = useRef<{
    readonly requestId: number;
    readonly at: number;
  }>({
    requestId: 0,
    at: 0,
  });
  const curiosityEligible =
    input.enabled &&
    input.cursorCuriosity &&
    input.activity === "idle" &&
    input.dragDirection === null &&
    !input.hovered &&
    !hidden &&
    !input.reducedMotion;
  const [curiosityPhase, setCuriosityPhase] =
    useState<CursorCuriosityPhase>("watching");

  useEffect(() => {
    if (!input.enabled) return;
    const handlePointerMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [input.enabled]);

  useEffect(() => {
    if (!curiosityEligible) {
      setCuriosityPhase("watching");
      return;
    }
    const timeout = window.setTimeout(
      () => {
        setCuriosityPhase((current) =>
          current === "watching" ? "resting" : "watching",
        );
      },
      resolveCursorCuriosityDuration(curiosityPhase, Math.random()),
    );
    return () => window.clearTimeout(timeout);
  }, [curiosityEligible, curiosityPhase]);

  useEffect(() => {
    if (!input.enabled) return;
    const handleVisibilityChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [input.enabled]);

  useEffect(() => {
    if (!input.enabled || hidden || input.reducedMotion) {
      setFrame(
        resolveAnimationFrame({ activity: input.activity, elapsedMs: 0 }),
      );
      return;
    }
    let frameId = 0;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      startedAt ??= now;
      if (input.activationRequestId !== activationStart.current.requestId) {
        activationStart.current = {
          requestId: input.activationRequestId,
          at: now,
        };
      }
      const directElapsedMs = now - startedAt;
      const latestPointer = pointer.current;
      const centerX = position.current.x + input.spriteWidth / 2;
      const centerY = position.current.y + input.spriteHeight / 2;
      const dx = latestPointer ? latestPointer.x - centerX : 0;
      const dy = latestPointer ? latestPointer.y - centerY : 0;
      let cursorDirection: number | null = null;
      if (
        curiosityEligible &&
        curiosityPhase === "watching" &&
        latestPointer &&
        Math.hypot(dx, dy) >= 4
      ) {
        direction.current = quantizePointerDirection({
          dx,
          dy,
          previous: direction.current,
        });
        cursorDirection = direction.current;
      }
      const nextFrame = resolvePetVisualFrame({
        activity: input.activity,
        activityElapsedMs: directElapsedMs,
        cursorDirection,
        directElapsedMs,
        dragDirection: input.dragDirection,
        hovered: input.hovered,
        idleElapsedMs: directElapsedMs,
        activationElapsedMs:
          input.activationRequestId === 0
            ? null
            : now - activationStart.current.at,
      });
      setFrame((current) =>
        framesEqual(current, nextFrame) ? current : nextFrame,
      );
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    hidden,
    input.activity,
    input.cursorCuriosity,
    input.dragDirection,
    input.enabled,
    input.hovered,
    input.reducedMotion,
    input.spriteHeight,
    input.spriteWidth,
    input.activationRequestId,
    curiosityEligible,
    curiosityPhase,
  ]);

  return frame;
}

function framesEqual(left: PetFrame, right: PetFrame): boolean {
  return (
    left.row === right.row &&
    left.column === right.column &&
    left.durationMs === right.durationMs
  );
}
