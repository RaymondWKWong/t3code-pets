import type { PetActivity } from "@t3code-pets/core";

export interface T3PetActivityInput {
  readonly isWorking: boolean;
  readonly hasPendingApproval: boolean;
  readonly hasPendingUserInput: boolean;
  readonly latestTurnOutcome: "completed" | "interrupted" | "failed" | null;
  readonly hasThreadError: boolean;
}

export function resolveT3PetActivity(input: T3PetActivityInput): PetActivity {
  if (input.hasPendingApproval || input.hasPendingUserInput) {
    return "waiting-for-user";
  }
  if (input.hasThreadError || input.latestTurnOutcome === "failed") {
    return "error";
  }
  if (input.isWorking) return "working";
  if (input.latestTurnOutcome === "completed") return "success";
  return "idle";
}
