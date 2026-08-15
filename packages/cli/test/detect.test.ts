import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { detectT3Checkout } from "../src/checkout/detect.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("detectT3Checkout", () => {
  it("detects the canonical root, web version, package manager, and HEAD", async () => {
    const root = await createCheckout();
    const detected = await detectT3Checkout(root);

    expect(detected).toMatchObject({
      root: await realpath(root),
      t3Version: "0.0.33",
      packageManager: "pnpm@11.10.0",
    });
    expect(detected.t3Commit).toMatch(/^[a-f0-9]{40}$/);
  });

  it("rejects a similarly shaped non-T3 repository", async () => {
    const root = await createCheckout("not-t3");
    await expect(detectT3Checkout(root)).rejects.toMatchObject({
      code: "checkout.invalid_root_package",
    });
  });
});

async function createCheckout(name = "@t3tools/monorepo"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "t3code-pets-detect-"));
  temporaryDirectories.push(root);
  const webPackage = join(root, "apps", "web", "package.json");
  await mkdir(dirname(webPackage), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name, packageManager: "pnpm@11.10.0" }),
  );
  await writeFile(
    webPackage,
    JSON.stringify({ name: "@t3tools/web", version: "0.0.33" }),
  );
  await execute("git", ["init", "-b", "fixture"], { cwd: root });
  await execute("git", ["config", "user.email", "fixture@example.com"], {
    cwd: root,
  });
  await execute("git", ["config", "user.name", "Fixture"], { cwd: root });
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-m", "fixture"], { cwd: root });
  return root;
}
