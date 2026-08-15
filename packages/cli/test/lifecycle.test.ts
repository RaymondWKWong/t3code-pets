import { describe, expect, it } from "vitest";

import { RESTART_NOTICE, withRestartNotice } from "../src/lifecycle.js";

describe("withRestartNotice", () => {
  it("adds one restart paragraph after a mutation", () => {
    const message = withRestartNotice("Installed T3 Pets 2.3.4", true);

    expect(message).toBe(`Installed T3 Pets 2.3.4\n\n${RESTART_NOTICE}`);
    expect(withRestartNotice(message, true)).toBe(message);
  });

  it("leaves non-mutating command output unchanged", () => {
    expect(withRestartNotice("T3 Pets 2.3.4 is up to date", false)).toBe(
      "T3 Pets 2.3.4 is up to date",
    );
  });
});
