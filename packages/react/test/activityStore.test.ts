import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPetActivityStore,
  resolvePetActivity,
} from "../src/activityStore.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("resolvePetActivity", () => {
  it("prioritizes waiting over working and error over success", () => {
    expect(resolvePetActivity(["working", "waiting-for-user"])).toBe(
      "waiting-for-user",
    );
    expect(resolvePetActivity(["success", "error"])).toBe("error");
    expect(resolvePetActivity([])).toBe("idle");
  });
});

describe("pet activity store", () => {
  it("expires transient terminal states after two seconds", () => {
    vi.useFakeTimers();
    const store = createPetActivityStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set("success", { transientForMs: 2_000 });
    expect(store.getSnapshot()).toBe("success");
    vi.advanceTimersByTime(1_999);
    expect(store.getSnapshot()).toBe("success");
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBe("idle");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("cancels stale expiry when a new steady activity arrives", () => {
    vi.useFakeTimers();
    const store = createPetActivityStore();
    store.set("error", { transientForMs: 2_000 });
    store.set("working");

    vi.advanceTimersByTime(2_000);
    expect(store.getSnapshot()).toBe("working");
  });
});
