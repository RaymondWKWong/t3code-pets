import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export async function resolveSafeCheckoutPath(
  checkoutRoot: string,
  relativePath: string,
): Promise<string> {
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath.includes("\0") ||
    relativePath.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Unsafe checkout path: ${relativePath}`);
  }
  const root = await realpath(checkoutRoot);
  const target = resolve(root, ...relativePath.split("/"));
  if (!isInside(root, target))
    throw new Error(`Path escapes checkout: ${relativePath}`);

  let existing = dirname(target);
  while (isInside(root, existing)) {
    try {
      const metadata = await lstat(existing);
      if (metadata.isSymbolicLink())
        throw new Error(`Path traverses a symlink: ${relativePath}`);
      const resolvedParent = await realpath(existing);
      if (!isInside(root, resolvedParent)) {
        throw new Error(`Path traverses outside checkout: ${relativePath}`);
      }
      break;
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
  }
  return target;
}

export async function atomicWriteOwnedFile(input: {
  readonly checkoutRoot: string;
  readonly relativePath: string;
  readonly bytes: Uint8Array;
  readonly expectedCurrentSha256: string | null;
}): Promise<{ readonly sha256: string }> {
  const target = await resolveSafeCheckoutPath(
    input.checkoutRoot,
    input.relativePath,
  );
  const current = await sha256FileOrNull(target);
  if (current !== input.expectedCurrentSha256) {
    throw new Error(`Current digest changed for ${input.relativePath}`);
  }
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(input.bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  const written = await sha256FileOrNull(target);
  const expected = sha256Bytes(input.bytes);
  if (written !== expected)
    throw new Error(`Written digest mismatch for ${input.relativePath}`);
  return { sha256: expected };
}

export async function sha256FileOrNull(path: string): Promise<string | null> {
  try {
    return sha256Bytes(new Uint8Array(await readFile(path)));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;
}

function isInside(root: string, target: string): boolean {
  const value = relative(root, target);
  return (
    value === "" ||
    (!value.startsWith(`..${sep}`) && value !== ".." && !isAbsolute(value))
  );
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { readonly code?: string }).code === "ENOENT"
  );
}
