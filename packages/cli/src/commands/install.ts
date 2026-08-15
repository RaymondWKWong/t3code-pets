import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertOwnedGitStatus,
  readGitStatus,
  type GitStatusRecord,
} from "../checkout/gitState.js";
import {
  detectT3Checkout,
  type DetectedT3Checkout,
} from "../checkout/detect.js";
import {
  resolveCorepackProcess,
  runProcess,
  type ProcessResult,
} from "../checkout/process.js";
import {
  selectCompatibilityAdapter,
  type CompatibilityCheckout,
} from "../compatibility/catalog.js";
import type {
  CompatibilityAdapter,
  PlannedEdit,
} from "../compatibility/adapter.js";
import {
  loadReleasePayload,
  planEmbeddedRuntimeEdits,
  type ReleasePayload,
} from "../release/payload.js";
import { sha256FileOrNull } from "../transaction/filesystem.js";
import { readInstallationState } from "../transaction/journal.js";
import { runTransaction } from "../transaction/runTransaction.js";
import type { InstallationState } from "../transaction/types.js";
import { FRAMEWORK_VERSION } from "../version.js";

export interface InstallOptions {
  readonly t3Path: string;
  readonly check?: boolean;
  readonly payloadRoot?: string;
}

export interface InstallResult {
  readonly status: "planned" | "installed" | "already-installed";
  readonly frameworkVersion: string;
  readonly adapterId: string;
  readonly t3Version: string;
  readonly t3Commit: string;
  readonly files: readonly string[];
}

export interface InstallDependencies {
  readonly detectCheckout: (path: string) => Promise<DetectedT3Checkout>;
  readonly selectAdapter: (
    checkout: CompatibilityCheckout,
    payloadRoot: string,
  ) => Promise<CompatibilityAdapter>;
  readonly readGitStatus: (root: string) => Promise<readonly GitStatusRecord[]>;
  readonly runProcess: (
    executable: string,
    arguments_: readonly string[],
    cwd: string,
  ) => Promise<ProcessResult>;
  readonly loadPayload: (payloadRoot: string) => Promise<ReleasePayload>;
}

const defaultDependencies: InstallDependencies = {
  detectCheckout: detectT3Checkout,
  selectAdapter: (checkout, payloadRoot) =>
    selectCompatibilityAdapter(checkout, { payloadRoot }),
  readGitStatus,
  runProcess,
  loadPayload: loadReleasePayload,
};

export async function installCommand(
  options: InstallOptions,
  dependencies: InstallDependencies = defaultDependencies,
): Promise<InstallResult> {
  const checkout = await dependencies.detectCheckout(options.t3Path);
  const payloadRoot = options.payloadRoot ?? defaultPayloadRoot();
  const existingState = await readInstallationStateOrNull(checkout.root);
  const gitStatus = await dependencies.readGitStatus(checkout.root);
  await assertOwnedGitStatus(checkout.root, existingState, gitStatus);

  if (existingState) {
    await assertExistingInstall(checkout, existingState);
    return resultFromState("already-installed", existingState);
  }

  const payload = await dependencies.loadPayload(payloadRoot);
  if (payload.manifest.frameworkVersion !== FRAMEWORK_VERSION) {
    throw new Error(
      `Payload framework ${payload.manifest.frameworkVersion} does not match CLI ${FRAMEWORK_VERSION}`,
    );
  }
  const adapter = await dependencies.selectAdapter(checkout, payloadRoot);
  const runtimeEdits = await planEmbeddedRuntimeEdits(checkout.root, payload);
  const sourceEdits = await adapter.plan(checkout.root, FRAMEWORK_VERSION);
  const excludeEdit = await planGitExcludeEdit(checkout.root);
  const edits = assertUniqueEdits([
    ...runtimeEdits,
    ...sourceEdits,
    ...(excludeEdit ? [excludeEdit] : []),
  ]);
  const metadata = {
    frameworkVersion: FRAMEWORK_VERSION,
    adapterId: adapter.id,
    t3Version: checkout.t3Version,
    t3Commit: checkout.t3Commit,
  };
  const planned = {
    status: "planned" as const,
    ...metadata,
    files: edits.map((edit) => edit.path),
  };
  if (options.check) return planned;

  let state: InstallationState;
  try {
    state = await runTransaction(
      checkout.root,
      edits,
      () => validateInstalledT3(checkout, dependencies.runProcess),
      metadata,
      { watchedPaths: ["pnpm-lock.yaml", "apps/web/src/routeTree.gen.ts"] },
    );
  } catch (error) {
    await reconcileDependenciesAfterRollback(
      checkout,
      dependencies.runProcess,
    ).catch(() => undefined);
    throw error;
  }
  return resultFromState("installed", state);
}

async function validateInstalledT3(
  checkout: DetectedT3Checkout,
  processRunner: InstallDependencies["runProcess"],
): Promise<void> {
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(checkout.packageManager)) {
    throw new Error(
      `Unsupported T3 package manager: ${checkout.packageManager}`,
    );
  }
  const corepack = await resolveCorepackProcess();
  const invoke = (arguments_: readonly string[]) =>
    processRunner(
      corepack.executable,
      [...corepack.prefixArguments, checkout.packageManager, ...arguments_],
      checkout.root,
    );
  await invoke(["install", "--frozen-lockfile=false"]);
  await invoke(["--filter", "@t3tools/web", "build"]);
  await invoke(["--filter", "@t3tools/web", "typecheck"]);
  await invoke(["--filter", "@t3tools/web", "test"]);
}

async function reconcileDependenciesAfterRollback(
  checkout: DetectedT3Checkout,
  processRunner: InstallDependencies["runProcess"],
): Promise<void> {
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(checkout.packageManager)) return;
  const corepack = await resolveCorepackProcess();
  await processRunner(
    corepack.executable,
    [
      ...corepack.prefixArguments,
      checkout.packageManager,
      "install",
      "--frozen-lockfile",
    ],
    checkout.root,
  );
}

async function planGitExcludeEdit(root: string): Promise<PlannedEdit | null> {
  const path = ".git/info/exclude";
  if (!(await lstat(join(root, ".git"))).isDirectory()) return null;
  let source: string;
  try {
    source = await readFile(join(root, ".git", "info", "exclude"), "utf8");
  } catch (error) {
    if (isMissing(error)) {
      return { kind: "create", path, content: "/.t3code-pets/\n" };
    }
    throw error;
  }
  if (source.split(/\r?\n/).includes("/.t3code-pets/")) return null;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const content = `${source}${source.length > 0 && !source.endsWith("\n") ? eol : ""}/.t3code-pets/${eol}`;
  return {
    kind: "modify",
    path,
    expectedBeforeSha256: (await sha256FileOrNull(
      join(root, ".git", "info", "exclude"),
    ))!,
    content,
  };
}

async function readInstallationStateOrNull(
  root: string,
): Promise<InstallationState | null> {
  try {
    return await readInstallationState(root);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function assertExistingInstall(
  checkout: DetectedT3Checkout,
  state: InstallationState,
): Promise<void> {
  if (
    state.frameworkVersion !== FRAMEWORK_VERSION ||
    state.t3Version !== checkout.t3Version ||
    state.t3Commit !== checkout.t3Commit
  ) {
    throw new Error("Existing T3 Pets installation needs update or repair");
  }
  const changed: string[] = [];
  for (const file of state.files) {
    if (
      (await sha256FileOrNull(join(checkout.root, ...file.path.split("/")))) !==
      file.afterSha256
    ) {
      changed.push(file.path);
    }
  }
  if (changed.length > 0) {
    throw new Error(
      `Existing T3 Pets installation is unhealthy: ${changed.join(", ")}`,
    );
  }
}

function assertUniqueEdits(
  edits: readonly PlannedEdit[],
): readonly PlannedEdit[] {
  const paths = new Set<string>();
  for (const edit of edits) {
    if (paths.has(edit.path))
      throw new Error(`Install plan contains duplicate path: ${edit.path}`);
    paths.add(edit.path);
  }
  return edits;
}

function resultFromState(
  status: "installed" | "already-installed",
  state: InstallationState,
): InstallResult {
  return {
    status,
    frameworkVersion: state.frameworkVersion,
    adapterId: state.adapterId,
    t3Version: state.t3Version,
    t3Commit: state.t3Commit,
    files: state.files.map((file) => file.path),
  };
}

function defaultPayloadRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "payload");
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { readonly code?: string }).code === "ENOENT"
  );
}
