import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { validatePetArchive } from "../packages/core/src/index.js";
import { buildRomeoPackage } from "../pets/romeo/build.js";

export async function buildValidatedRomeoPackage(outputPath: string) {
  await mkdir(dirname(outputPath), { recursive: true });
  const built = await buildRomeoPackage(outputPath);
  const validated = await validatePetArchive(
    new Uint8Array(await readFile(outputPath)),
  );
  if (!validated.ok) {
    throw new Error(validated.issues.map((issue) => issue.message).join("; "));
  }
  return built;
}
