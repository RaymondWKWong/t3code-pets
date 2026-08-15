import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
await copyFile(
  join(repositoryRoot, "packages", "react", "dist", "style.css"),
  join(repositoryRoot, "packages", "t3", "dist", "style.css"),
);
