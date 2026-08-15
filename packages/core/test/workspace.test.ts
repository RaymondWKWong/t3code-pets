import { describe, expect, it } from "vitest";

import { PET_SCHEMA_VERSION } from "../src/index.js";

describe("workspace", () => {
  it("exports the core schema version", () => {
    expect(PET_SCHEMA_VERSION).toBe(1);
  });
});
