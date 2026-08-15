import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompatibilityAdapter } from "../src/compatibility/adapter.js";
import {
  installCommand,
  type InstallDependencies,
} from "../src/commands/install.js";
import { createPayloadManifest } from "../src/release/payload.js";
import { FRAMEWORK_VERSION } from "../src/version.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("installCommand", () => {
  it("returns a read-only, verified plan for --check", async () => {
    const fixture = await createFixture();
    const dependencies = createDependencies(fixture.root, fixture.payloadRoot);

    const result = await installCommand(
      { t3Path: fixture.root, check: true, payloadRoot: fixture.payloadRoot },
      dependencies,
    );

    expect(result.status).toBe("planned");
    expect(result.files).toContain(
      `.t3code-pets/runtime/${FRAMEWORK_VERSION}/t3/dist/index.mjs`,
    );
    await expect(
      readFile(
        join(
          fixture.root,
          `.t3code-pets/runtime/${FRAMEWORK_VERSION}/t3/dist/index.mjs`,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(dependencies.runProcess).not.toHaveBeenCalled();
  });

  it("installs payload and source edits, validates, and becomes idempotent", async () => {
    const fixture = await createFixture();
    const dependencies = createDependencies(fixture.root, fixture.payloadRoot);

    const result = await installCommand(
      { t3Path: fixture.root, payloadRoot: fixture.payloadRoot },
      dependencies,
    );

    expect(result.status).toBe("installed");
    await expect(
      readFile(
        join(
          fixture.root,
          `.t3code-pets/runtime/${FRAMEWORK_VERSION}/t3/dist/index.mjs`,
        ),
        "utf8",
      ),
    ).resolves.toBe("export const pet = true;\n");
    await expect(
      readFile(join(fixture.root, "integration.ts"), "utf8"),
    ).resolves.toBe("integration\n");
    expect(dependencies.runProcess).toHaveBeenCalledTimes(4);

    const second = await installCommand(
      { t3Path: fixture.root, payloadRoot: fixture.payloadRoot },
      dependencies,
    );
    expect(second.status).toBe("already-installed");
    expect(dependencies.runProcess).toHaveBeenCalledTimes(4);
  });

  it("rolls back payload, source, and validation changes after failure", async () => {
    const fixture = await createFixture();
    const dependencies = createDependencies(fixture.root, fixture.payloadRoot);
    dependencies.runProcess.mockImplementationOnce(async () => {
      await writeFile(join(fixture.root, "pnpm-lock.yaml"), "partial\n");
      throw new Error("pnpm failed");
    });

    await expect(
      installCommand(
        { t3Path: fixture.root, payloadRoot: fixture.payloadRoot },
        dependencies,
      ),
    ).rejects.toThrow("pnpm failed");

    await expect(
      readFile(join(fixture.root, "pnpm-lock.yaml"), "utf8"),
    ).resolves.toBe("original\n");
    await expect(
      readFile(join(fixture.root, "integration.ts")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(
        join(
          fixture.root,
          `.t3code-pets/runtime/${FRAMEWORK_VERSION}/t3/dist/index.mjs`,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function createFixture(): Promise<{ root: string; payloadRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "t3code-pets-install root-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, ".git", "info"), { recursive: true });
  await mkdir(join(root, "apps", "web", "src"), { recursive: true });
  await writeFile(join(root, ".git", "info", "exclude"), "# local excludes\n");
  await writeFile(join(root, "pnpm-lock.yaml"), "original\n");
  await writeFile(
    join(root, "apps", "web", "src", "routeTree.gen.ts"),
    "routes\n",
  );

  const payloadRoot = join(root, "payload-source");
  const payloadFile = "runtime/t3/dist/index.mjs";
  const payloadPath = join(payloadRoot, ...payloadFile.split("/"));
  await mkdir(dirname(payloadPath), { recursive: true });
  await writeFile(payloadPath, "export const pet = true;\n");
  const manifest = await createPayloadManifest(payloadRoot, FRAMEWORK_VERSION);
  await writeFile(
    join(payloadRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { root, payloadRoot };
}

function createDependencies(
  root: string,
  payloadRoot: string,
): InstallDependencies & {
  runProcess: ReturnType<typeof vi.fn>;
} {
  const adapter: CompatibilityAdapter = {
    id: "test-adapter",
    t3Version: "0.0.33",
    inspect: async () => [],
    plan: async () => [
      { kind: "create", path: "integration.ts", content: "integration\n" },
    ],
  };
  const runProcess = vi.fn(async () => ({ stdout: "", stderr: "" }));
  return {
    detectCheckout: async () => ({
      root,
      t3Version: "0.0.33",
      t3Commit: "a".repeat(40),
      packageManager: "pnpm@11.10.0",
    }),
    selectAdapter: async () => adapter,
    readGitStatus: async () => [],
    runProcess,
    loadPayload: async () => {
      const { loadReleasePayload } = await import("../src/release/payload.js");
      return loadReleasePayload(payloadRoot);
    },
  };
}
