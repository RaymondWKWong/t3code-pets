import { describe, expect, it } from "vitest";

import { resolveT3PetActivity } from "../src/activity.js";

const base = {
  isWorking: false,
  hasPendingApproval: false,
  hasPendingUserInput: false,
  latestTurnOutcome: null,
  hasThreadError: false,
} as const;

describe("resolveT3PetActivity", () => {
  it("prioritizes user action over background work", () => {
    expect(
      resolveT3PetActivity({
        ...base,
        isWorking: true,
        hasPendingApproval: true,
      }),
    ).toBe("waiting-for-user");
  });

  it.each([
    [{ ...base, hasThreadError: true }, "error"],
    [{ ...base, latestTurnOutcome: "failed" }, "error"],
    [{ ...base, isWorking: true }, "working"],
    [{ ...base, latestTurnOutcome: "completed" }, "success"],
    [{ ...base, latestTurnOutcome: "interrupted" }, "idle"],
    [base, "idle"],
  ] as const)("maps a normalized T3 state to %s", (input, expected) => {
    expect(resolveT3PetActivity(input)).toBe(expected);
  });
});
