// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setPetActivity: vi.fn(),
}));

vi.mock("@t3code-pets/react", async (importOriginal) => ({
  ...(await importOriginal()),
  setPetActivity: mocks.setPetActivity,
}));

import { T3PetsActivityReporter } from "../src/T3PetsActivityReporter.js";

afterEach(() => {
  cleanup();
  mocks.setPetActivity.mockReset();
});

describe("T3PetsActivityReporter", () => {
  it("reports only resolved transitions", () => {
    const props = {
      isWorking: true,
      hasPendingApproval: false,
      hasPendingUserInput: false,
      latestTurnOutcome: null,
      hasThreadError: false,
    } as const;
    const { rerender } = render(<T3PetsActivityReporter {...props} />);
    expect(mocks.setPetActivity).toHaveBeenCalledTimes(1);
    expect(mocks.setPetActivity).toHaveBeenLastCalledWith("working", undefined);

    rerender(<T3PetsActivityReporter {...props} />);
    expect(mocks.setPetActivity).toHaveBeenCalledTimes(1);

    rerender(
      <T3PetsActivityReporter
        {...props}
        latestTurnOutcome="failed"
        isWorking={false}
      />,
    );
    expect(mocks.setPetActivity).toHaveBeenLastCalledWith("error", {
      transientForMs: 2_000,
    });
  });
});
