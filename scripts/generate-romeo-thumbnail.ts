import { open, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(
  repositoryRoot,
  "pets",
  "romeo",
  "spritesheet-right.webp",
);
const outputPath = join(repositoryRoot, "pets", "romeo", "thumbnail.webp");
const temporaryPath = join(
  dirname(outputPath),
  `.${basename(outputPath)}.${process.pid}.tmp`,
);

const bytes = await sharp(sourcePath)
  .extract({ left: 0, top: 0, width: 192, height: 208 })
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
const handle = await open(temporaryPath, "w");
try {
  await handle.writeFile(bytes);
  await handle.sync();
} finally {
  await handle.close();
}
await rename(temporaryPath, outputPath);
console.log(`${outputPath} ${bytes.byteLength} bytes`);
