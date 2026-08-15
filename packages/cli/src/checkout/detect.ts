import { readFile, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { runProcess } from "./process.js";

export interface DetectedT3Checkout {
  readonly root: string;
  readonly t3Version: string;
  readonly t3Commit: string;
  readonly packageManager: string;
}

export class CheckoutError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
    this.path = path;
  }
}

export async function detectT3Checkout(
  inputPath: string,
): Promise<DetectedT3Checkout> {
  const requested = resolve(inputPath);
  let root: string;
  try {
    if (!(await stat(requested)).isDirectory())
      throw new Error("Not a directory");
    root = await realpath(requested);
  } catch {
    throw new CheckoutError(
      "checkout.missing_root",
      requested,
      "T3 checkout directory does not exist",
    );
  }

  const rootPackage = await readJson(joinPath(root, "package.json"));
  if (rootPackage["name"] !== "@t3tools/monorepo") {
    throw new CheckoutError(
      "checkout.invalid_root_package",
      "package.json",
      "Root package is not @t3tools/monorepo",
    );
  }
  const webPackage = await readJson(joinPath(root, "apps/web/package.json"));
  if (
    webPackage["name"] !== "@t3tools/web" ||
    typeof webPackage["version"] !== "string"
  ) {
    throw new CheckoutError(
      "checkout.invalid_web_package",
      "apps/web/package.json",
      "Web package identity or version is invalid",
    );
  }
  if (typeof rootPackage["packageManager"] !== "string") {
    throw new CheckoutError(
      "checkout.invalid_package_manager",
      "package.json",
      "Root packageManager is missing",
    );
  }
  let t3Commit: string;
  try {
    t3Commit = (
      await runProcess("git", ["rev-parse", "HEAD"], root)
    ).stdout.trim();
  } catch {
    throw new CheckoutError(
      "checkout.not_git_repository",
      root,
      "Directory is not a Git checkout with a resolvable HEAD",
    );
  }
  if (!/^[a-f0-9]{40}$/.test(t3Commit)) {
    throw new CheckoutError(
      "checkout.invalid_head",
      root,
      "Git HEAD is not a full commit SHA",
    );
  }
  return {
    root,
    t3Version: webPackage["version"],
    t3Commit,
    packageManager: rootPackage["packageManager"],
  };
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new CheckoutError(
      "checkout.invalid_json",
      path,
      error instanceof Error ? error.message : "Package JSON could not be read",
    );
  }
}

function joinPath(root: string, relativePath: string): string {
  return resolve(root, ...relativePath.split("/"));
}
