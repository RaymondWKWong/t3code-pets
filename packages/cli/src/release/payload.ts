import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { PlannedEdit } from "../compatibility/adapter.js";
import {
  resolveSafeCheckoutPath,
  sha256Bytes,
  sha256FileOrNull,
} from "../transaction/filesystem.js";

export interface PayloadFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface PayloadManifest {
  readonly schemaVersion: 1;
  readonly frameworkVersion: string;
  readonly files: readonly PayloadFile[];
}

export interface ReleasePayload {
  readonly root: string;
  readonly manifest: PayloadManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export async function createPayloadManifest(
  payloadRoot: string,
  frameworkVersion: string,
): Promise<PayloadManifest> {
  const paths = (await listPayloadFiles(payloadRoot)).filter(
    (path) => path !== "manifest.json",
  );
  const files = await Promise.all(
    paths.map(async (path) => {
      const bytes = new Uint8Array(
        await readFile(join(payloadRoot, ...path.split("/"))),
      );
      return { path, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
    }),
  );
  return { schemaVersion: 1, frameworkVersion, files };
}

export async function loadReleasePayload(
  payloadRoot: string,
): Promise<ReleasePayload> {
  const parsed = JSON.parse(
    await readFile(join(payloadRoot, "manifest.json"), "utf8"),
  ) as Partial<PayloadManifest>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.frameworkVersion !== "string" ||
    !Array.isArray(parsed.files)
  ) {
    throw new Error("Release payload manifest is invalid");
  }

  const manifest = parsed as PayloadManifest;
  const actualPaths = (await listPayloadFiles(payloadRoot)).filter(
    (path) => path !== "manifest.json",
  );
  const declaredPaths = manifest.files.map((file) => file.path);
  if (
    new Set(declaredPaths).size !== declaredPaths.length ||
    JSON.stringify([...declaredPaths].sort()) !== JSON.stringify(actualPaths)
  ) {
    throw new Error("Release payload file list does not match its manifest");
  }

  const files = new Map<string, Uint8Array>();
  for (const file of manifest.files) {
    assertPayloadPath(file.path);
    const bytes = new Uint8Array(
      await readFile(join(payloadRoot, ...file.path.split("/"))),
    );
    if (bytes.byteLength !== file.bytes || sha256Bytes(bytes) !== file.sha256) {
      throw new Error(`Release payload fingerprint mismatch: ${file.path}`);
    }
    files.set(file.path, bytes);
  }
  return { root: payloadRoot, manifest, files };
}

export async function planEmbeddedRuntimeEdits(
  checkoutRoot: string,
  payload: ReleasePayload,
): Promise<readonly PlannedEdit[]> {
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(
      payload.manifest.frameworkVersion,
    )
  ) {
    throw new Error("Release payload framework version is invalid");
  }
  const edits: PlannedEdit[] = [];
  for (const [path, bytes] of payload.files) {
    if (!path.startsWith("runtime/")) continue;
    const runtimePath = path.slice("runtime/".length);
    const installPath = `.t3code-pets/runtime/${payload.manifest.frameworkVersion}/${runtimePath}`;
    const target = await resolveSafeCheckoutPath(checkoutRoot, installPath);
    if ((await sha256FileOrNull(target)) !== null) {
      throw new Error(`Runtime install target already exists: ${installPath}`);
    }
    edits.push({ kind: "create", path: installPath, content: bytes });
  }
  if (edits.length === 0)
    throw new Error("Release payload contains no runtime files");
  return edits;
}

async function listPayloadFiles(
  root: string,
  prefix = "",
): Promise<readonly string[]> {
  const directory = join(root, ...prefix.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`Payload symlink is forbidden: ${entry.name}`);
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assertPayloadPath(path);
    if (entry.isDirectory())
      paths.push(...(await listPayloadFiles(root, path)));
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`Unsupported payload entry: ${path}`);
  }
  return paths.sort();
}

function assertPayloadPath(path: string): void {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe payload path: ${path}`);
  }
}
