import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

interface Catalog {
  readonly schemaVersion: 1;
  readonly frameworkVersion: string;
  readonly entries: readonly {
    readonly adapterId: string;
    readonly t3Version: string;
    readonly t3Commit: string;
    readonly observedTags: readonly string[];
  }[];
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(repositoryRoot, "compatibility", "compatibility.json");
const outputPath = join(repositoryRoot, "docs", "compatibility.md");
const parsed: unknown = JSON.parse(await readFile(catalogPath, "utf8"));
const catalog = parseCatalog(parsed);
for (const entry of catalog.entries) {
  if (
    !/^\d+\.\d+\.\d+$/.test(entry.t3Version) ||
    !/^[a-f0-9]{40}$/.test(entry.t3Commit)
  ) {
    throw new Error(`Invalid compatibility entry: ${entry.adapterId}`);
  }
}
const rows = [...catalog.entries]
  .sort((left, right) => left.t3Version.localeCompare(right.t3Version))
  .map(
    (entry) =>
      `| ${entry.t3Version} | \`${entry.t3Commit.slice(0, 8)}\` | \`${entry.adapterId}\` | ${catalog.frameworkVersion} | ${entry.observedTags.join(", ")} |`,
  )
  .join("\n");
const output = await format(
  `# T3 compatibility\n\nSupport is exact and fail-closed. A listed version is supported only at the listed full commit after the compatibility workflow passes. New upstream releases are never marked compatible automatically.\n\n| T3 version | Commit | Adapter | Pets version | Observed tag |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Maintenance workflow\n\n1. The scheduled workflow detects a new upstream commit and opens or updates one issue.\n2. A maintainer runs the adapter inspection and clean-checkout install suite against that exact commit.\n3. Structural differences are handled in a new or deliberately extended adapter with fixtures and refusal tests.\n4. The exact version and 40-character commit are added to \`compatibility.json\` only after install, doctor, build, typecheck, tests, idempotence, and uninstall restoration pass.\n5. A new Pets release bundles that catalog. Older releases remain pinned to their own tested catalog.\n\nThis process keeps maintenance bounded to small host integration points instead of merging a T3 fork.\n`,
  { parser: "markdown" },
);

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output)
    throw new Error("docs/compatibility.md is out of date");
} else {
  await writeFile(outputPath, output);
  process.stdout.write(`${outputPath}\n`);
}

function parseCatalog(value: unknown): Catalog {
  if (!isRecord(value) || value["schemaVersion"] !== 1) {
    throw new Error("Compatibility catalog is invalid");
  }
  const frameworkVersion = value["frameworkVersion"];
  const entries = value["entries"];
  if (typeof frameworkVersion !== "string" || !Array.isArray(entries)) {
    throw new Error("Compatibility catalog is invalid");
  }
  const parsedEntries = entries.map((entry) => {
    if (!isRecord(entry)) throw new Error("Compatibility entry is invalid");
    const adapterId = entry["adapterId"];
    const t3Version = entry["t3Version"];
    const t3Commit = entry["t3Commit"];
    const observedTags = entry["observedTags"];
    if (
      typeof adapterId !== "string" ||
      typeof t3Version !== "string" ||
      typeof t3Commit !== "string" ||
      !Array.isArray(observedTags) ||
      !observedTags.every((tag): tag is string => typeof tag === "string")
    ) {
      throw new Error("Compatibility entry is invalid");
    }
    return { adapterId, t3Version, t3Commit, observedTags };
  });
  return { schemaVersion: 1, frameworkVersion, entries: parsedEntries };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
