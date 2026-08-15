import { describe, expect, it, vi } from "vitest";

import {
  t3UpdateCommand,
  validateGitName,
  type T3UpdateDependencies,
} from "../src/commands/t3Update.js";

const oldCommit = "a".repeat(40);
const newCommit = "b".repeat(40);

describe("t3UpdateCommand", () => {
  it("fetches but performs no mutation when upstream is current", async () => {
    const dependencies = createDependencies(oldCommit);
    const result = await t3UpdateCommand({ t3Path: "C:/T3" }, dependencies);
    expect(result.status).toBe("up-to-date");
    expect(dependencies.uninstall).not.toHaveBeenCalled();
    expect(dependencies.install).not.toHaveBeenCalled();
  });

  it("prevalidates a supported target without mutating the current checkout", async () => {
    const dependencies = createDependencies(newCommit);
    const result = await t3UpdateCommand(
      { t3Path: "C:/T3", check: true },
      dependencies,
    );
    expect(result.status).toBe("available");
    expect(dependencies.install).toHaveBeenCalledWith(
      expect.objectContaining({ check: true }),
    );
    expect(dependencies.uninstall).not.toHaveBeenCalled();
  });

  it("rejects unsafe remote and branch names", () => {
    expect(() => validateGitName("origin; rm", "remote")).toThrow();
    expect(() => validateGitName("../main", "branch")).toThrow();
  });
});

function createDependencies(targetCommit: string): T3UpdateDependencies & {
  install: ReturnType<typeof vi.fn>;
  uninstall: ReturnType<typeof vi.fn>;
} {
  const install = vi.fn(async () => ({
    status: "planned" as const,
    frameworkVersion: "1.0.0",
    adapterId: "test",
    t3Version: "0.0.34",
    t3Commit: targetCommit,
    files: [],
  }));
  const uninstall = vi.fn(async () => undefined);
  return {
    doctor: async () => ({ healthy: true, checks: [] }),
    install,
    uninstall,
    readState: async () => ({
      schemaVersion: 1,
      frameworkVersion: "1.0.0",
      adapterId: "test",
      t3Version: "0.0.33",
      t3Commit: oldCommit,
      installedAt: new Date(0).toISOString(),
      files: [],
    }),
    readGitStatus: async () => [],
    runProcess: vi.fn(
      async (_executable: string, arguments_: readonly string[]) => ({
        stdout: arguments_[0] === "rev-parse" ? `${targetCommit}\n` : "",
        stderr: "",
      }),
    ),
    makeTemporaryDirectory: async () => "C:/Temp/pets-update",
    removeTemporaryDirectory: async () => undefined,
  };
}
