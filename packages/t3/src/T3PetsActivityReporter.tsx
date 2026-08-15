import { setPetActivity } from "@t3code-pets/react";
import { useEffect, useRef } from "react";

import { resolveT3PetActivity, type T3PetActivityInput } from "./activity.js";

export function T3PetsActivityReporter(props: T3PetActivityInput) {
  const activity = resolveT3PetActivity(props);
  const previous = useRef<typeof activity | null>(null);

  useEffect(() => {
    if (activity === previous.current) return;
    previous.current = activity;
    setPetActivity(
      activity,
      activity === "success" || activity === "error"
        ? { transientForMs: 2_000 }
        : undefined,
    );
  }, [activity]);

  return null;
}
