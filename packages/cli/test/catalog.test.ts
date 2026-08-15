import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { selectCompatibilityAdapter } from "../src/compatibility/catalog.js";

const repositoryRoot = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);
const fixtureRoot = join(
  repositoryRoot,
  "compatibility",
  "t3-0.0.33",
  "fixtures",
);
const temporaryDirectories: string[] = [];
const supportedCommit = "78f462c4e18c8ea5e5037dc916389a3b72246025";
const previousSupportedCommit = "560d4a4560ddb5f42c8f8e0e35fa7827c0e46f80";
const currentSupportedCommit = "f0719072a1c6435b5a91243afc57bc8bf1f3e2b6";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("selectCompatibilityAdapter", () => {
  it("selects only the exact inspected T3 release and structure", async () => {
    const root = await createFixtureCheckout();
    await expect(
      selectCompatibilityAdapter({
        root,
        t3Version: "0.0.33",
        t3Commit: supportedCommit,
      }),
    ).resolves.toMatchObject({ id: "t3-0.0.33" });
  });

  it.each([previousSupportedCommit, currentSupportedCommit])(
    "selects inspected T3 release %s",
    async (t3Commit) => {
      const root = await createFixtureCheckout();
      await expect(
        selectCompatibilityAdapter({
          root,
          t3Version: "0.0.33",
          t3Commit,
        }),
      ).resolves.toMatchObject({ id: "t3-0.0.33" });
    },
  );

  it.each([
    ["0.0.32", supportedCommit],
    ["0.0.34", supportedCommit],
    ["0.0.33", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["nightly", supportedCommit],
  ])("rejects unsupported version %s at %s", async (t3Version, t3Commit) => {
    const root = await createFixtureCheckout();
    await expect(
      selectCompatibilityAdapter({ root, t3Version, t3Commit }),
    ).rejects.toMatchObject({ code: "compatibility.unsupported_t3" });
  });

  it("rejects the right version when a structural target drifted", async () => {
    const root = await createFixtureCheckout();
    const path = join(
      root,
      "apps",
      "web",
      "src",
      "components",
      "settings",
      "settingsSearch.ts",
    );
    await writeFile(path, "export type SettingsPath = string;\n", "utf8");

    await expect(
      selectCompatibilityAdapter({
        root,
        t3Version: "0.0.33",
        t3Commit: supportedCommit,
      }),
    ).rejects.toMatchObject({ code: "compatibility.structure_mismatch" });
  });
});

async function createFixtureCheckout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "t3code-pets-adapter-"));
  temporaryDirectories.push(root);
  const mappings = [
    ["package.json", "package.json"],
    ["apps-web-package.json", "apps/web/package.json"],
    ["vite.config.ts", "apps/web/vite.config.ts"],
    ["settingsSearch.ts", "apps/web/src/components/settings/settingsSearch.ts"],
    [
      "SettingsSidebarNav.tsx",
      "apps/web/src/components/settings/SettingsSidebarNav.tsx",
    ],
    ["rootRoute.tsx", "apps/web/src/routes/__root.tsx"],
    ["ChatView.tsx", "apps/web/src/components/ChatView.tsx"],
  ] as const;
  for (const [source, target] of mappings) {
    const targetPath = join(root, target);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(join(fixtureRoot, source), targetPath);
  }
  expect(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")),
  ).toMatchObject({
    name: "@t3tools/monorepo",
  });
  return root;
}
