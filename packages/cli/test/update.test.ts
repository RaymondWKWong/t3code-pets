import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sha256Text } from "../src/compatibility/adapter.js";
import { uninstallCommand } from "../src/commands/uninstall.js";
import {
  updateCommand,
  type UpdateDependencies,
} from "../src/commands/update.js";
import { readInstallationState } from "../src/transaction/journal.js";
import { runTransaction } from "../src/transaction/runTransaction.js";
import type { InstallationState } from "../src/transaction/types.js";
import { FRAMEWORK_VERSION } from "../src/version.js";

const checkout = {
  root: "C:/T3",
  t3Version: "0.0.33",
  t3Commit: "a".repeat(40),
  packageManager: "pnpm@11.10.0",
} as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const currentState: InstallationState = {
  schemaVersion: 1,
  frameworkVersion: FRAMEWORK_VERSION,
  adapterId: "t3-0.0.33",
  t3Version: checkout.t3Version,
  t3Commit: checkout.t3Commit,
  installedAt: "2026-08-10T00:00:00.000Z",
  files: [],
};

function dependencies(
  state: InstallationState = currentState,
): UpdateDependencies {
  return {
    assertOwnedStatus: vi.fn(async () => undefined),
    detectCheckout: vi.fn(async () => checkout),
    delay: vi.fn(async () => undefined),
    doctor: vi.fn(async () => ({ healthy: true, checks: [] })),
    install: vi.fn(async () => ({
      status: "installed" as const,
      frameworkVersion: FRAMEWORK_VERSION,
      adapterId: "t3-0.0.33",
      t3Version: checkout.t3Version,
      t3Commit: checkout.t3Commit,
      files: [],
    })),
    loadPayload: vi.fn(async () => ({
      root: "C:/payload",
      manifest: {
        schemaVersion: 1 as const,
        frameworkVersion: FRAMEWORK_VERSION,
        files: [],
      },
      files: new Map(),
    })),
    readGitStatus: vi.fn(async () => []),
    readState: vi.fn(async () => state),
    selectAdapter: vi.fn(async () => ({
      id: "t3-0.0.33",
      t3Version: checkout.t3Version,
      inspect: async () => [],
      plan: async () => [],
    })),
    uninstall: vi.fn(async () => undefined),
  };
}

describe("updateCommand", () => {
  it("reports the current healthy framework as up to date", async () => {
    const deps = dependencies();

    await expect(updateCommand({ t3Path: "C:/T3" }, deps)).resolves.toEqual({
      status: "up-to-date",
      frameworkVersion: FRAMEWORK_VERSION,
    });
    expect(deps.doctor).toHaveBeenCalledOnce();
    expect(deps.uninstall).not.toHaveBeenCalled();
    expect(deps.install).not.toHaveBeenCalled();
  });

  it("preflights and replaces an older healthy installation", async () => {
    const deps = dependencies({ ...currentState, frameworkVersion: "0.9.0" });

    await expect(
      updateCommand({ t3Path: "C:/T3", payloadRoot: "C:/payload" }, deps),
    ).resolves.toEqual({
      status: "updated",
      previousFrameworkVersion: "0.9.0",
      frameworkVersion: FRAMEWORK_VERSION,
    });
    expect(deps.assertOwnedStatus).toHaveBeenCalledWith(
      checkout.root,
      expect.objectContaining({ frameworkVersion: "0.9.0" }),
      [],
    );
    expect(deps.selectAdapter).toHaveBeenCalledWith(checkout, "C:/payload");
    expect(deps.uninstall).toHaveBeenCalledWith({
      t3Path: checkout.root,
      runPostUninstall: false,
    });
    expect(deps.install).toHaveBeenCalledWith({
      t3Path: checkout.root,
      payloadRoot: "C:/payload",
    });
  });

  it("waits for transient generated-file changes after uninstall", async () => {
    const deps = dependencies({ ...currentState, frameworkVersion: "0.9.0" });
    vi.mocked(deps.readGitStatus)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          index: " ",
          worktree: "M",
          path: "apps/web/src/routeTree.gen.ts",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      updateCommand({ t3Path: "C:/T3" }, deps),
    ).resolves.toMatchObject({ status: "updated" });
    expect(deps.readGitStatus).toHaveBeenCalledTimes(4);
    expect(deps.install).toHaveBeenCalledOnce();
  });

  it("refuses a changed T3 checkout before uninstalling", async () => {
    const deps = dependencies({ ...currentState, frameworkVersion: "0.9.0" });
    vi.mocked(deps.detectCheckout).mockResolvedValue({
      ...checkout,
      t3Commit: "b".repeat(40),
    });

    await expect(updateCommand({ t3Path: "C:/T3" }, deps)).rejects.toThrow(
      "T3 checkout changed since Pets was installed",
    );
    expect(deps.uninstall).not.toHaveBeenCalled();
  });

  it("refuses an adapter identity mismatch before uninstalling", async () => {
    const deps = dependencies({ ...currentState, frameworkVersion: "0.9.0" });
    vi.mocked(deps.selectAdapter).mockResolvedValue({
      id: "different-adapter",
      t3Version: checkout.t3Version,
      inspect: async () => [],
      plan: async () => [],
    });

    await expect(updateCommand({ t3Path: "C:/T3" }, deps)).rejects.toThrow(
      "adapter changed since Pets was installed",
    );
    expect(deps.uninstall).not.toHaveBeenCalled();
  });

  it("preserves the installed version when an original backup is corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "t3code-pets-update-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "existing.txt"), "before\n");
    await runTransaction(
      root,
      [
        {
          kind: "modify",
          path: "existing.txt",
          expectedBeforeSha256: sha256Text("before\n"),
          content: "after\n",
        },
      ],
      async () => undefined,
      {
        frameworkVersion: "0.9.0",
        adapterId: "t3-0.0.33",
        t3Version: checkout.t3Version,
        t3Commit: checkout.t3Commit,
      },
    );
    const installedState = await readInstallationState(root);
    const backup = installedState.files[0]?.backupRelativePath;
    expect(backup).toBeTruthy();
    await writeFile(join(root, backup!), "corrupt\n");
    const deps: UpdateDependencies = {
      ...dependencies(installedState),
      detectCheckout: vi.fn(async () => ({ ...checkout, root })),
      readState: readInstallationState,
      uninstall: (options) => uninstallCommand(options),
    };

    await expect(
      updateCommand({ t3Path: root, payloadRoot: "C:/payload" }, deps),
    ).rejects.toMatchObject({ code: "uninstall.corrupt_backup" });
    expect(deps.install).not.toHaveBeenCalled();
    await expect(readFile(join(root, "existing.txt"), "utf8")).resolves.toBe(
      "after\n",
    );
    await expect(readInstallationState(root)).resolves.toMatchObject({
      frameworkVersion: "0.9.0",
    });
  });

  it("refuses to downgrade a newer installation", async () => {
    const deps = dependencies({ ...currentState, frameworkVersion: "2.0.0" });

    await expect(updateCommand({ t3Path: "C:/T3" }, deps)).rejects.toThrow(
      "newer than this updater",
    );
    expect(deps.uninstall).not.toHaveBeenCalled();
  });

  it("leaves T3 clean and reports recovery when the new install fails", async () => {
    const deps = dependencies({ ...currentState, frameworkVersion: "0.9.0" });
    vi.mocked(deps.install).mockRejectedValue(new Error("validation failed"));

    await expect(updateCommand({ t3Path: "C:/T3" }, deps)).rejects.toThrow(
      "T3 was restored without Pets; cause: validation failed",
    );
    expect(deps.uninstall).toHaveBeenCalledOnce();
  });
});
