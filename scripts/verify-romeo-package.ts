import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildValidatedRomeoPackage } from "./build-romeo-package.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(repositoryRoot, "dist");
const outputPath = join(outputDirectory, "romeo.t3pet");
const built = await buildValidatedRomeoPackage(outputPath);
console.log(`${outputPath} ${built.bytes} bytes sha256=${built.sha256}`);
