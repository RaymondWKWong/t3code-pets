import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getT300033Adapter } from "../../../../compatibility/t3-0.0.33/adapter.js";
import { CompatibilityError, type CompatibilityAdapter } from "./adapter.js";

interface CompatibilityCatalog {
  readonly schemaVersion: 1;
  readonly frameworkVersion: string;
  readonly entries: readonly {
    readonly adapterId: string;
    readonly t3Version: string;
    readonly t3Commit: string;
    readonly observedTags: readonly string[];
  }[];
}

export interface CompatibilityCheckout {
  readonly root: string;
  readonly t3Version: string;
  readonly t3Commit: string;
}

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

export async function selectCompatibilityAdapter(
  checkout: CompatibilityCheckout,
  options: { readonly payloadRoot?: string } = {},
): Promise<CompatibilityAdapter> {
  const catalog = await readCatalog(options.payloadRoot);
  const entry = catalog.entries.find(
    (candidate) =>
      candidate.t3Version === checkout.t3Version &&
      candidate.t3Commit === checkout.t3Commit,
  );
  if (!entry) {
    throw new CompatibilityError(
      "compatibility.unsupported_t3",
      checkout.root,
      {
        t3Version: checkout.t3Version,
        t3Commit: checkout.t3Commit,
      },
    );
  }
  const adapter = adapterById(entry.adapterId, options.payloadRoot);
  const issues = await adapter.inspect(checkout.root);
  if (issues.length > 0) {
    throw new CompatibilityError(
      "compatibility.structure_mismatch",
      checkout.root,
      {
        issues,
      },
    );
  }
  return adapter;
}

async function readCatalog(
  payloadRoot?: string,
): Promise<CompatibilityCatalog> {
  const path = payloadRoot
    ? join(payloadRoot, "compatibility", "compatibility.json")
    : join(repositoryRoot, "compatibility", "compatibility.json");
  const parsed = JSON.parse(
    await readFile(path, "utf8"),
  ) as Partial<CompatibilityCatalog>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.frameworkVersion !== "string" ||
    !Array.isArray(parsed.entries)
  ) {
    throw new CompatibilityError("compatibility.invalid_catalog", path);
  }
  return parsed as CompatibilityCatalog;
}

function adapterById(id: string, payloadRoot?: string): CompatibilityAdapter {
  if (id === "t3-0.0.33") {
    return getT300033Adapter(
      payloadRoot
        ? {
            templateDirectory: join(
              payloadRoot,
              "compatibility",
              id,
              "templates",
            ),
          }
        : undefined,
    );
  }
  throw new CompatibilityError("compatibility.unknown_adapter", id);
}
