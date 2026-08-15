import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectT3Checkout,
  type DetectedT3Checkout,
} from "../checkout/detect.js";
import {
  assertOwnedGitStatus,
  readGitStatus,
  type GitStatusRecord,
} from "../checkout/gitState.js";
import {
  selectCompatibilityAdapter,
  type CompatibilityCheckout,
} from "../compatibility/catalog.js";
import type { CompatibilityAdapter } from "../compatibility/adapter.js";
import {
  resolveSafeCheckoutPath,
  sha256FileOrNull,
} from "../transaction/filesystem.js";
import { readInstallationState } from "../transaction/journal.js";
import { FRAMEWORK_VERSION } from "../version.js";

export interface DoctorReport {
  readonly healthy: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly status: "pass" | "fail";
    readonly message: string;
  }[];
}

export interface DoctorDependencies {
  readonly detectCheckout: (path: string) => Promise<DetectedT3Checkout>;
  readonly readGitStatus: (root: string) => Promise<readonly GitStatusRecord[]>;
  readonly selectAdapter: (
    checkout: CompatibilityCheckout,
    payloadRoot: string,
  ) => Promise<CompatibilityAdapter>;
}

const defaults: DoctorDependencies = {
  detectCheckout: detectT3Checkout,
  readGitStatus,
  selectAdapter: (checkout, payloadRoot) =>
    selectCompatibilityAdapter(checkout, { payloadRoot }),
};

export async function doctorCommand(
  options: { readonly t3Path: string; readonly payloadRoot?: string },
  dependencies: DoctorDependencies = defaults,
): Promise<DoctorReport> {
  const checks: DoctorReport["checks"][number][] = [];
  try {
    const state = await readInstallationState(options.t3Path);
    checks.push(pass("installation-state", "Installation state is valid"));

    for (const file of state.files) {
      const target = await resolveSafeCheckoutPath(options.t3Path, file.path);
      const passed = (await sha256FileOrNull(target)) === file.afterSha256;
      checks.push({
        id: `managed:${file.path}`,
        status: passed ? "pass" : "fail",
        message: passed
          ? "Fingerprint matches"
          : "Managed file changed or is missing",
      });
    }

    checks.push(
      state.frameworkVersion === FRAMEWORK_VERSION
        ? pass("framework-version", `Framework ${FRAMEWORK_VERSION} is current`)
        : fail(
            "framework-version",
            `Installed framework ${state.frameworkVersion} does not match ${FRAMEWORK_VERSION}`,
          ),
    );

    const checkout = await dependencies.detectCheckout(options.t3Path);
    checks.push(
      checkout.t3Version === state.t3Version
        ? pass(
            "t3-version",
            `T3 ${checkout.t3Version} matches installation state`,
          )
        : fail("t3-version", "T3 version changed after Pets was installed"),
      checkout.t3Commit === state.t3Commit
        ? pass("t3-commit", "T3 commit matches installation state")
        : fail("t3-commit", "T3 commit changed after Pets was installed"),
    );

    try {
      const payloadRoot = options.payloadRoot ?? defaultPayloadRoot();
      const adapter = await dependencies.selectAdapter(checkout, payloadRoot);
      checks.push(
        adapter.id === state.adapterId
          ? pass(
              "compatibility",
              `Adapter ${adapter.id} supports this checkout`,
            )
          : fail(
              "compatibility",
              "Installed adapter does not match this checkout",
            ),
      );
    } catch (error) {
      checks.push(fail("compatibility", messageOf(error)));
    }

    try {
      await assertOwnedGitStatus(
        checkout.root,
        state,
        await dependencies.readGitStatus(checkout.root),
      );
      checks.push(pass("git-ownership", "All Git changes are installer-owned"));
    } catch (error) {
      checks.push(fail("git-ownership", messageOf(error)));
    }

    const journal = await sha256FileOrNull(
      await resolveSafeCheckoutPath(checkout.root, ".t3code-pets/journal.json"),
    );
    checks.push(
      journal === null
        ? pass("transaction", "No interrupted transaction is present")
        : fail("transaction", "An interrupted transaction needs recovery"),
    );
  } catch (error) {
    checks.push(fail("installation-state", messageOf(error)));
  }
  return { healthy: checks.every((check) => check.status === "pass"), checks };
}

function pass(id: string, message: string): DoctorReport["checks"][number] {
  return { id, status: "pass", message };
}

function fail(id: string, message: string): DoctorReport["checks"][number] {
  return { id, status: "fail", message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown diagnostic failure";
}

function defaultPayloadRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "payload");
}
