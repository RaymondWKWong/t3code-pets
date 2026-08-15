import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveCorepackProcess,
  runProcess,
} from "../packages/cli/src/checkout/process.js";
import {
  createPayloadManifest,
  loadReleasePayload,
} from "../packages/cli/src/release/payload.js";
import { FRAMEWORK_VERSION } from "../packages/cli/src/version.js";
import { buildValidatedRomeoPackage } from "./build-romeo-package.js";
import {
  createReleasePackageJson,
  releaseAssetNames,
} from "./release-contract.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = join(repositoryRoot, "dist", "release");
const packageRoot = join(releaseRoot, "package");
const payloadRoot = join(packageRoot, "payload");
const outputRoot = join(repositoryRoot, "dist");
const releaseAssets = releaseAssetNames(FRAMEWORK_VERSION);

await buildReleasePackage();

async function buildReleasePackage(): Promise<void> {
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(payloadRoot, { recursive: true });
  await copyRuntimePackage("core", runtimePackageJson("core"));
  await copyRuntimePackage("react", runtimePackageJson("react"));
  await copyRuntimePackage("t3", runtimePackageJson("t3"));
  const romeoPackagePath = join(outputRoot, "romeo.t3pet");
  await buildValidatedRomeoPackage(romeoPackagePath);
  await cp(
    romeoPackagePath,
    join(payloadRoot, "runtime", "t3", "dist", "romeo.t3pet"),
  );
  await cp(
    join(repositoryRoot, "compatibility", "compatibility.json"),
    join(payloadRoot, "compatibility", "compatibility.json"),
  );
  await cp(
    join(repositoryRoot, "compatibility", "t3-0.0.33", "templates"),
    join(payloadRoot, "compatibility", "t3-0.0.33", "templates"),
    { recursive: true },
  );
  await cp(join(repositoryRoot, "LICENSE"), join(payloadRoot, "LICENSE"));

  const payloadManifest = await createPayloadManifest(
    payloadRoot,
    FRAMEWORK_VERSION,
  );
  await writeJson(join(payloadRoot, "manifest.json"), payloadManifest);
  await loadReleasePayload(payloadRoot);

  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await cp(
    join(repositoryRoot, "packages", "cli", "dist", "cli.mjs"),
    join(packageRoot, "dist", "cli.mjs"),
  );
  await cp(join(repositoryRoot, "LICENSE"), join(packageRoot, "LICENSE"));
  await cp(join(repositoryRoot, "README.md"), join(packageRoot, "README.md"));
  await writeJson(
    join(packageRoot, "package.json"),
    createReleasePackageJson(FRAMEWORK_VERSION),
  );

  const corepack = await resolveCorepackProcess();
  const { stdout } = await runProcess(
    corepack.executable,
    [
      ...corepack.prefixArguments,
      "pnpm@11.10.0",
      "pack",
      "--pack-destination",
      outputRoot,
    ],
    packageRoot,
  );
  const tarballPath = join(outputRoot, releaseAssets.versionedTarballName);
  const bytes = await readFile(tarballPath);
  const stableTarballPath = join(outputRoot, releaseAssets.stableTarballName);
  await writeFile(stableTarballPath, bytes);
  const stableBytes = await readFile(stableTarballPath);
  if (!bytes.equals(stableBytes)) {
    throw new Error("Stable release tarball differs from versioned tarball");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(
    join(outputRoot, releaseAssets.checksumName),
    `${digest}  ${releaseAssets.versionedTarballName}\n${digest}  ${releaseAssets.stableTarballName}\n`,
  );
  process.stdout.write(
    `${stdout.trim()}\n${tarballPath}\n${bytes.byteLength} bytes\nsha256 ${digest}\n`,
  );
}

async function copyRuntimePackage(
  name: "core" | "react" | "t3",
  packageJson: Record<string, unknown>,
): Promise<void> {
  const target = join(payloadRoot, "runtime", name);
  await mkdir(target, { recursive: true });
  await cp(
    join(repositoryRoot, "packages", name, "dist"),
    join(target, "dist"),
    {
      recursive: true,
    },
  );
  await writeJson(join(target, "package.json"), packageJson);
  await cp(join(repositoryRoot, "LICENSE"), join(target, "LICENSE"));
}

function runtimePackageJson(
  name: "core" | "react" | "t3",
): Record<string, unknown> {
  const packageName = `@t3code-pets/${name}`;
  const base: Record<string, unknown> = {
    name: packageName,
    version: FRAMEWORK_VERSION,
    private: true,
    license: "MIT",
    type: "module",
    exports: {
      ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
    },
  };
  if (name === "core") {
    base["dependencies"] = {
      "@zip.js/zip.js": "2.8.36",
      "image-size": "2.0.2",
      zod: "4.1.12",
    };
  } else if (name === "react") {
    (base["exports"] as Record<string, unknown>)["./pets.css"] =
      "./dist/style.css";
    base["dependencies"] = { "@t3code-pets/core": "file:../core" };
    base["peerDependencies"] = { react: "^19.2.0", "react-dom": "^19.2.0" };
  } else {
    (base["exports"] as Record<string, unknown>)["./pets.css"] =
      "./dist/style.css";
    base["dependencies"] = {
      "@t3code-pets/core": "file:../core",
      "@t3code-pets/react": "file:../react",
    };
    base["peerDependencies"] = { react: "^19.2.0", "react-dom": "^19.2.0" };
  }
  return base;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
