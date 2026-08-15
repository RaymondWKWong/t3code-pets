export type PetActivity =
  "idle" | "working" | "waiting-for-user" | "success" | "error";

export type PetAnimationState =
  | "failed"
  | "idle"
  | "jumping"
  | "review"
  | "running"
  | "running-left"
  | "running-right"
  | "waving"
  | "waiting";

type ActivePetAnimationState = Exclude<PetAnimationState, "idle">;

export interface PetFrame {
  readonly row: number;
  readonly column: number;
  readonly durationMs: number;
}

export interface PetAnimationSequence {
  readonly frames: readonly PetFrame[];
  readonly loopStartIndex: number;
}

const slowIdleFrames: readonly PetFrame[] = [280, 110, 110, 140, 140, 320].map(
  (durationMs, column) => ({ row: 0, column, durationMs: durationMs * 6 }),
);

const activityStates: Readonly<
  Record<Exclude<PetActivity, "idle">, ActivePetAnimationState>
> = {
  working: "running",
  "waiting-for-user": "waiting",
  success: "waving",
  error: "failed",
};

const stateDefinitions: Readonly<
  Record<
    ActivePetAnimationState,
    {
      readonly row: number;
      readonly frameCount: number;
      readonly durationMs: number;
      readonly finalDurationMs: number;
    }
  >
> = {
  "running-right": {
    row: 1,
    frameCount: 8,
    durationMs: 120,
    finalDurationMs: 220,
  },
  "running-left": {
    row: 2,
    frameCount: 8,
    durationMs: 120,
    finalDurationMs: 220,
  },
  waving: {
    row: 3,
    frameCount: 4,
    durationMs: 140,
    finalDurationMs: 280,
  },
  jumping: {
    row: 4,
    frameCount: 5,
    durationMs: 140,
    finalDurationMs: 280,
  },
  failed: {
    row: 5,
    frameCount: 8,
    durationMs: 140,
    finalDurationMs: 240,
  },
  waiting: {
    row: 6,
    frameCount: 6,
    durationMs: 150,
    finalDurationMs: 260,
  },
  running: {
    row: 7,
    frameCount: 6,
    durationMs: 120,
    finalDurationMs: 220,
  },
  review: {
    row: 8,
    frameCount: 6,
    durationMs: 150,
    finalDurationMs: 280,
  },
};

export function resolveAnimationSequence(
  activity: PetActivity,
): PetAnimationSequence {
  if (activity === "idle") {
    return { frames: slowIdleFrames, loopStartIndex: 0 };
  }

  const state = activityStates[activity];
  const stateFrames = framesForState(state);
  const repeatedStateFrames = Array.from(
    { length: 3 },
    () => stateFrames,
  ).flat();
  const repeatsWhileSteady =
    activity === "working" || activity === "waiting-for-user";
  return {
    frames: [...repeatedStateFrames, ...slowIdleFrames],
    loopStartIndex: repeatsWhileSteady ? 0 : repeatedStateFrames.length,
  };
}

export function resolveAnimationFrame(input: {
  readonly activity: PetActivity;
  readonly elapsedMs: number;
}): PetFrame {
  const sequence = resolveAnimationSequence(input.activity);
  const elapsedMs = Number.isFinite(input.elapsedMs)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, input.elapsedMs))
    : 0;
  const prefixDuration = sumDurations(
    sequence.frames.slice(0, sequence.loopStartIndex),
  );
  const loopFrames = sequence.frames.slice(sequence.loopStartIndex);
  const loopDuration = sumDurations(loopFrames);
  const startIndex = elapsedMs < prefixDuration ? 0 : sequence.loopStartIndex;
  let remaining =
    elapsedMs < prefixDuration
      ? elapsedMs
      : (elapsedMs - prefixDuration) % loopDuration;

  for (let index = startIndex; index < sequence.frames.length; index += 1) {
    const frame = sequence.frames[index];
    if (!frame) break;
    if (remaining < frame.durationMs) return frame;
    remaining -= frame.durationMs;
  }
  return sequence.frames[sequence.loopStartIndex] ?? slowIdleFrames[0]!;
}

export function resolvePetAnimationStateFrame(input: {
  readonly state: PetAnimationState;
  readonly elapsedMs: number;
}): PetFrame {
  const frames =
    input.state === "idle" ? slowIdleFrames : framesForState(input.state);
  const elapsedMs = Number.isFinite(input.elapsedMs)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, input.elapsedMs))
    : 0;
  let remaining = elapsedMs % sumDurations(frames);
  for (const frame of frames) {
    if (remaining < frame.durationMs) return frame;
    remaining -= frame.durationMs;
  }
  return frames[0]!;
}

export function quantizePointerDirection(input: {
  readonly dx: number;
  readonly dy: number;
  readonly previous: number;
}): number {
  const previous = normalizeDirection(input.previous);
  if (!Number.isFinite(input.dx) || !Number.isFinite(input.dy)) return previous;
  if (Math.hypot(input.dx, input.dy) < 4) return previous;

  const fullTurn = Math.PI * 2;
  const angle = (Math.atan2(input.dx, -input.dy) + fullTurn) % fullTurn;
  return Math.round(angle / (fullTurn / 16)) % 16;
}

function normalizeDirection(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((Math.round(value) % 16) + 16) % 16;
}

function framesForState(state: ActivePetAnimationState): readonly PetFrame[] {
  const definition = stateDefinitions[state];
  return Array.from(
    { length: definition.frameCount },
    (_, column): PetFrame => ({
      row: definition.row,
      column,
      durationMs:
        column === definition.frameCount - 1
          ? definition.finalDurationMs
          : definition.durationMs,
    }),
  );
}

function sumDurations(frames: readonly PetFrame[]): number {
  return frames.reduce((total, frame) => total + frame.durationMs, 0);
}
