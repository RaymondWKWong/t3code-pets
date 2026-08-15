import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { getT300033Adapter } from "../../../compatibility/t3-0.0.33/adapter.js";

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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("T3 0.0.33 adapter", () => {
  it("plans all native integration points and is idempotent after application", async () => {
    const root = await createFixtureCheckout();
    const adapter = getT300033Adapter();
    const edits = await adapter.plan(root, "1.0.0");

    expect(edits.map((edit) => edit.path).sort()).toEqual([
      "apps/web/package.json",
      "apps/web/src/components/ChatView.tsx",
      "apps/web/src/components/settings/SettingsSidebarNav.tsx",
      "apps/web/src/components/settings/settingsSearch.ts",
      "apps/web/src/routes/__root.tsx",
      "apps/web/src/routes/settings.pets.tsx",
      "apps/web/src/t3code-pets/T3PetsIntegration.tsx",
      "apps/web/vite.config.ts",
    ]);
    await applyEdits(root, edits);

    expect(
      await readFile(join(root, "apps/web/package.json"), "utf8"),
    ).toContain(
      '"@t3code-pets/t3": "file:../../.t3code-pets/runtime/1.0.0/t3"',
    );
    expect(
      await readFile(join(root, "apps/web/vite.config.ts"), "utf8"),
    ).toContain(
      'exclude: ["@t3code-pets/core", "@t3code-pets/react", "@t3code-pets/t3"]',
    );
    expect(
      await readFile(
        join(root, "apps/web/src/components/settings/settingsSearch.ts"),
        "utf8",
      ),
    ).toContain('"/settings/pets": "Pets"');
    expect(
      await readFile(
        join(root, "apps/web/src/components/settings/SettingsSidebarNav.tsx"),
        "utf8",
      ),
    ).toContain('"/settings/pets": PawPrintIcon');
    expect(
      await readFile(join(root, "apps/web/src/routes/__root.tsx"), "utf8"),
    ).toContain("<T3PetsHost />");
    expect(
      await readFile(
        join(root, "apps/web/src/components/ChatView.tsx"),
        "utf8",
      ),
    ).toContain("<T3PetsActivityReporter");

    await expect(adapter.plan(root, "1.0.0")).resolves.toEqual([]);
  });

  it("refuses a missing or duplicate semantic target", async () => {
    const root = await createFixtureCheckout();
    const settingsPath = join(
      root,
      "apps/web/src/components/settings/settingsSearch.ts",
    );
    const source = await readFile(settingsPath, "utf8");
    await writeFile(
      settingsPath,
      source.replace("export type SettingsPath", "export type OtherPath"),
    );

    await expect(getT300033Adapter().plan(root, "1.0.0")).rejects.toMatchObject(
      {
        code: "compatibility.settings_path_target",
      },
    );
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
  return root;
}

async function applyEdits(
  root: string,
  edits: readonly {
    readonly path: string;
    readonly content: string | Uint8Array;
  }[],
): Promise<void> {
  for (const edit of edits) {
    const path = join(root, edit.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, edit.content);
  }
}
