import { describe, expect, it, vi } from "vitest";

import { assertCleanCheckout } from "../scripts/assert-clean-checkout.js";
import { assertReleaseTag } from "../scripts/check-release-tag.js";

describe("assertReleaseTag", () => {
  it("accepts only the exact version tag", () => {
    expect(() => assertReleaseTag("v2.3.4", "2.3.4")).not.toThrow();
  });

  it.each(["2.3.4", "v2.3.3", "release-v2.3.4", "v2.3.4-extra", ""])(
    "rejects release tag %j for version 2.3.4",
    (tag) => {
      expect(() => assertReleaseTag(tag, "2.3.4")).toThrow(
        `Release tag ${tag || "<empty>"} does not match package version 2.3.4`,
      );
    },
  );
});

describe("assertCleanCheckout", () => {
  it("accepts an empty porcelain status", async () => {
    const runProcess = vi.fn(async () => ({ stdout: "\n", stderr: "" }));

    await expect(
      assertCleanCheckout("C:/T3", runProcess),
    ).resolves.toBeUndefined();
    expect(runProcess).toHaveBeenCalledWith(
      "git",
      ["status", "--porcelain"],
      "C:/T3",
    );
  });

  it("rejects remaining checkout changes", async () => {
    const runProcess = vi.fn(async () => ({
      stdout: " M apps/web/package.json\n",
      stderr: "",
    }));

    await expect(assertCleanCheckout("C:/T3", runProcess)).rejects.toThrow(
      "T3 checkout is not clean after uninstall: M apps/web/package.json",
    );
  });
});
