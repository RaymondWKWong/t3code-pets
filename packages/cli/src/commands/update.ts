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
  selectCompatibilityAdapter,
  type CompatibilityCheckout,
} from "../compatibility/catalog.js";
import type { CompatibilityAdapter } from "../compatibility/adapter.js";
import { loadReleasePayload, type ReleasePayload } from "../release/payload.js";
import { readInstallationState } from "../transaction/journal.js";
import { TransactionRecoveryError } from "../transaction/runTransaction.js";
import type { InstallationState } from "../transaction/types.js";
import { FRAMEWORK_VERSION } from "../version.js";
import { doctorCommand, type DoctorReport } from "./doctor.js";
import { installCommand, type InstallResult } from "./install.js";
import { uninstallCommand } from "./uninstall.js";

export type UpdateResult =
  | {
      readonly status: "up-to-date";
      readonly frameworkVersion: string;
    }
  | {
      readonly status: "updated";
      readonly previousFrameworkVersion: string;
      readonly frameworkVersion: string;
    };

export interface UpdateDependencies {
  readonly assertOwnedStatus: (
    root: string,
    state: InstallationState | null,
    status: readonly GitStatusRecord[],
  ) => Promise<void>;
  readonly detectCheckout: (path: string) => Promise<DetectedT3Checkout>;
  readonly delay: (milliseconds: number) => Promise<void>;
  readonly doctor: typeof doctorCommand;
  readonly install: (
    options: Parameters<typeof installCommand>[0],
  ) => Promise<InstallResult>;
  readonly loadPayload: (payloadRoot: string) => Promise<ReleasePayload>;
  readonly readGitStatus: (root: string) => Promise<readonly GitStatusRecord[]>;
  readonly readState: (root: string) => Promise<InstallationState>;
  readonly selectAdapter: (
    checkout: CompatibilityCheckout,
    payloadRoot: string,
  ) => Promise<CompatibilityAdapter>;
  readonly uninstall: typeof uninstallCommand;
}

const defaultDependencies: UpdateDependencies = {
  assertOwnedStatus: assertOwnedGitStatus,
  detectCheckout: detectT3Checkout,
  delay: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  doctor: doctorCommand,
  install: installCommand,
  loadPayload: loadReleasePayload,
  readGitStatus,
  readState: readInstallationState,
  selectAdapter: (checkout, payloadRoot) =>
    selectCompatibilityAdapter(checkout, { payloadRoot }),
  uninstall: uninstallCommand,
};

export async function updateCommand(
  options: { readonly t3Path: string; readonly payloadRoot?: string },
  dependencies: UpdateDependencies = defaultDependencies,
): Promise<UpdateResult> {
  const checkout = await dependencies.detectCheckout(options.t3Path);
  const state = await dependencies.readState(checkout.root);
  const versionComparison = compareFrameworkVersions(
    state.frameworkVersion,
    FRAMEWORK_VERSION,
  );
  if (versionComparison > 0) {
    throw new Error(
      `Installed framework ${state.frameworkVersion} is newer than this updater ${FRAMEWORK_VERSION}`,
    );
  }
  if (versionComparison === 0) {
    const report: DoctorReport = await dependencies.doctor({
      ...options,
      t3Path: checkout.root,
    });
    assertHealthy(report, "Update preflight failed");
    return { status: "up-to-date", frameworkVersion: FRAMEWORK_VERSION };
  }

  if (
    checkout.t3Version !== state.t3Version ||
    checkout.t3Commit !== state.t3Commit
  ) {
    throw new Error("T3 checkout changed since Pets was installed");
  }
  const gitStatus = await dependencies.readGitStatus(checkout.root);
  await dependencies.assertOwnedStatus(checkout.root, state, gitStatus);

  const payloadRoot = options.payloadRoot ?? defaultPayloadRoot();
  const payload = await dependencies.loadPayload(payloadRoot);
  if (payload.manifest.frameworkVersion !== FRAMEWORK_VERSION) {
    throw new Error(
      `Payload framework ${payload.manifest.frameworkVersion} does not match updater ${FRAMEWORK_VERSION}`,
    );
  }
  const adapter = await dependencies.selectAdapter(checkout, payloadRoot);
  if (adapter.id !== state.adapterId) {
    throw new Error(
      `T3 compatibility adapter changed since Pets was installed: ${state.adapterId} -> ${adapter.id}`,
    );
  }

  await dependencies.uninstall({
    t3Path: checkout.root,
    runPostUninstall: false,
  });
  try {
    await waitForCleanCheckout(checkout.root, dependencies);
    await dependencies.install({ t3Path: checkout.root, payloadRoot });
  } catch (error) {
    if (error instanceof TransactionRecoveryError) throw error;
    throw new Error(
      `Update failed after removing Pets ${state.frameworkVersion}. T3 was restored without Pets; cause: ${messageOf(error)}. Resolve it and rerun update.`,
      { cause: error },
    );
  }

  return {
    status: "updated",
    previousFrameworkVersion: state.frameworkVersion,
    frameworkVersion: FRAMEWORK_VERSION,
  };
}

const checkoutSettleIntervalMs = 100;
const checkoutSettleAttempts = 50;
const requiredCleanSamples = 2;

async function waitForCleanCheckout(
  root: string,
  dependencies: UpdateDependencies,
): Promise<void> {
  let cleanSamples = 0;
  let latestStatus: readonly GitStatusRecord[] = [];
  await dependencies.delay(checkoutSettleIntervalMs);
  for (let attempt = 0; attempt < checkoutSettleAttempts; attempt += 1) {
    latestStatus = await dependencies.readGitStatus(root);
    cleanSamples = latestStatus.length === 0 ? cleanSamples + 1 : 0;
    if (cleanSamples >= requiredCleanSamples) return;
    await dependencies.delay(checkoutSettleIntervalMs);
  }
  await dependencies.assertOwnedStatus(root, null, latestStatus);
  throw new Error("T3 checkout did not remain clean after removing Pets");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertHealthy(report: DoctorReport, prefix: string): void {
  if (report.healthy) return;
  const failures = report.checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.id}: ${check.message}`);
  throw new Error(`${prefix}: ${failures.join("; ")}`);
}

function compareFrameworkVersions(left: string, right: string): number {
  const parse = (value: string): readonly number[] => {
    if (!/^\d+\.\d+\.\d+$/.test(value)) {
      throw new Error(`Invalid framework version: ${value}`);
    }
    return value.split(".").map(Number);
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function defaultPayloadRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "payload");
}
