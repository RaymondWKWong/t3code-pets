const repositoryUrl = "https://github.com/RaymondWKWong/t3code-pets";
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function releaseAssetNames(version: string): {
  readonly versionedTarballName: string;
  readonly stableTarballName: string;
  readonly checksumName: string;
} {
  assertFrameworkVersion(version);
  return {
    versionedTarballName: `t3code-pets-${version}.tgz`,
    stableTarballName: "t3code-pets.tgz",
    checksumName: "SHA256SUMS.txt",
  };
}

export function createReleasePackageJson(
  version: string,
): Record<string, unknown> {
  assertFrameworkVersion(version);
  return {
    name: "t3code-pets",
    version,
    description: "Version-gated animated pets for T3 Code source checkouts",
    keywords: ["t3-code", "pets", "sprite", "companion"],
    homepage: `${repositoryUrl}#readme`,
    bugs: { url: `${repositoryUrl}/issues` },
    repository: {
      type: "git",
      url: `git+${repositoryUrl}.git`,
    },
    license: "MIT",
    type: "module",
    bin: { "t3code-pets": "./dist/cli.mjs" },
    files: ["dist", "payload", "LICENSE", "README.md"],
    engines: { node: ">=24.13.0 <25" },
    dependencies: {
      "@babel/parser": "7.29.8",
      "jsonc-parser": "3.3.1",
      recast: "0.23.11",
    },
  };
}

function assertFrameworkVersion(version: string): void {
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid framework version: ${version}`);
  }
}
