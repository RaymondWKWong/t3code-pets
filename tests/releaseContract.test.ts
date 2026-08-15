import { describe, expect, it } from "vitest";

import {
  createReleasePackageJson,
  releaseAssetNames,
} from "../scripts/release-contract.js";
import { FRAMEWORK_VERSION } from "../packages/cli/src/version.js";

describe("initial public release", () => {
  it("builds the unreleased framework as version 1.0.0", () => {
    expect(createReleasePackageJson(FRAMEWORK_VERSION)).toMatchObject({
      version: "1.0.0",
    });
    expect(releaseAssetNames(FRAMEWORK_VERSION).versionedTarballName).toBe(
      "t3code-pets-1.0.0.tgz",
    );
  });
});

describe("releaseAssetNames", () => {
  it("provides immutable and stable release asset names", () => {
    expect(releaseAssetNames("2.3.4")).toEqual({
      versionedTarballName: "t3code-pets-2.3.4.tgz",
      stableTarballName: "t3code-pets.tgz",
      checksumName: "SHA256SUMS.txt",
    });
  });

  it.each(["1.2", "v2.3.4", "2.3.4/extra", "latest", ""])(
    "rejects invalid framework version %j",
    (version) => {
      expect(() => releaseAssetNames(version)).toThrow(
        `Invalid framework version: ${version}`,
      );
    },
  );
});

describe("createReleasePackageJson", () => {
  it("contains complete public package metadata", () => {
    const packageJson = createReleasePackageJson("2.3.4");

    expect(packageJson).toMatchObject({
      name: "t3code-pets",
      version: "2.3.4",
      homepage: "https://github.com/RaymondWKWong/t3code-pets#readme",
      bugs: { url: "https://github.com/RaymondWKWong/t3code-pets/issues" },
      repository: {
        type: "git",
        url: "git+https://github.com/RaymondWKWong/t3code-pets.git",
      },
      keywords: ["t3-code", "pets", "sprite", "companion"],
      files: ["dist", "payload", "LICENSE", "README.md"],
    });
  });

  it("rejects an invalid package version", () => {
    expect(() => createReleasePackageJson("next")).toThrow(
      "Invalid framework version: next",
    );
  });
});
