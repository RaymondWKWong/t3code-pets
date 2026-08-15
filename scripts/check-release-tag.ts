import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function assertReleaseTag(tag: string, version: string): void {
  if (tag !== `v${version}`) {
    throw new Error(
      `Release tag ${tag || "<empty>"} does not match package version ${version}`,
    );
  }
}

if (isDirectRun()) {
  const tag = process.argv[2] ?? "";
  const version = process.argv[3] ?? "";
  assertReleaseTag(tag, version);
  process.stdout.write(`${tag}\n`);
}

function isDirectRun(): boolean {
  const scriptPath = process.argv[1];
  return Boolean(
    scriptPath && pathToFileURL(resolve(scriptPath)).href === import.meta.url,
  );
}
