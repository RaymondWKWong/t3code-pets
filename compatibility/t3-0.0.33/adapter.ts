import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { namedTypes as N } from "ast-types";
import type { ExpressionKind } from "ast-types/lib/gen/kinds.js";
import { applyEdits, modify } from "jsonc-parser";
import { parse, print, types, visit } from "recast";
import * as tsParser from "recast/parsers/babel-ts.js";

import {
  CompatibilityError,
  requireSingleNode,
  sha256Text,
  type CompatibilityAdapter,
  type CompatibilityIssue,
  type PlannedEdit,
} from "../../packages/cli/src/compatibility/adapter.js";

const adapterDirectory = dirname(fileURLToPath(import.meta.url));
const webPackagePath = "apps/web/package.json";
const viteConfigPath = "apps/web/vite.config.ts";
const settingsSearchPath = "apps/web/src/components/settings/settingsSearch.ts";
const settingsSidebarPath =
  "apps/web/src/components/settings/SettingsSidebarNav.tsx";
const rootRoutePath = "apps/web/src/routes/__root.tsx";
const chatViewPath = "apps/web/src/components/ChatView.tsx";
const settingsRoutePath = "apps/web/src/routes/settings.pets.tsx";
const integrationPath = "apps/web/src/t3code-pets/T3PetsIntegration.tsx";
const integrationImport = "../t3code-pets/T3PetsIntegration";

export function getT300033Adapter(options?: {
  readonly templateDirectory: string;
}): CompatibilityAdapter {
  const templateDirectory =
    options?.templateDirectory ?? join(adapterDirectory, "templates");
  return {
    id: "t3-0.0.33",
    t3Version: "0.0.33",
    inspect,
    plan: (checkoutRoot, frameworkVersion) =>
      plan(checkoutRoot, frameworkVersion, templateDirectory),
  };
}

async function inspect(
  checkoutRoot: string,
): Promise<readonly CompatibilityIssue[]> {
  try {
    await assertPackageIdentity(checkoutRoot);
    await transformFile(checkoutRoot, viteConfigPath, transformViteConfig);
    await transformFile(
      checkoutRoot,
      settingsSearchPath,
      transformSettingsSearch,
    );
    await transformFile(
      checkoutRoot,
      settingsSidebarPath,
      transformSettingsSidebar,
    );
    await transformFile(checkoutRoot, rootRoutePath, transformRootRoute);
    await transformFile(checkoutRoot, chatViewPath, transformChatView);
    return [];
  } catch (error) {
    if (error instanceof CompatibilityError) {
      return [{ code: error.code, path: error.path, message: error.message }];
    }
    return [
      {
        code: "compatibility.inspect_failed",
        path: checkoutRoot,
        message:
          error instanceof Error
            ? error.message
            : "Compatibility inspection failed",
      },
    ];
  }
}

async function plan(
  checkoutRoot: string,
  frameworkVersion: string,
  templateDirectory: string,
): Promise<readonly PlannedEdit[]> {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(frameworkVersion)) {
    throw new CompatibilityError(
      "compatibility.invalid_framework_version",
      frameworkVersion,
    );
  }
  await assertPackageIdentity(checkoutRoot);
  const edits: PlannedEdit[] = [];
  await planModifiedFile(
    checkoutRoot,
    webPackagePath,
    (source) => transformWebPackage(source, frameworkVersion),
    edits,
  );
  await planModifiedFile(
    checkoutRoot,
    viteConfigPath,
    transformViteConfig,
    edits,
  );
  await planModifiedFile(
    checkoutRoot,
    settingsSearchPath,
    transformSettingsSearch,
    edits,
  );
  await planModifiedFile(
    checkoutRoot,
    settingsSidebarPath,
    transformSettingsSidebar,
    edits,
  );
  await planModifiedFile(
    checkoutRoot,
    rootRoutePath,
    transformRootRoute,
    edits,
  );
  await planModifiedFile(checkoutRoot, chatViewPath, transformChatView, edits);
  await planCreatedFile(
    checkoutRoot,
    settingsRoutePath,
    await readFile(join(templateDirectory, "settings.pets.tsx"), "utf8"),
    edits,
  );
  await planCreatedFile(
    checkoutRoot,
    integrationPath,
    await readFile(join(templateDirectory, "T3PetsIntegration.tsx"), "utf8"),
    edits,
  );
  return edits;
}

async function assertPackageIdentity(checkoutRoot: string): Promise<void> {
  const rootPackage = JSON.parse(
    await readFile(join(checkoutRoot, "package.json"), "utf8"),
  ) as { readonly name?: string };
  const webPackage = JSON.parse(
    await readFile(join(checkoutRoot, webPackagePath), "utf8"),
  ) as { readonly name?: string; readonly version?: string };
  if (rootPackage.name !== "@t3tools/monorepo") {
    throw new CompatibilityError("compatibility.root_package", "package.json");
  }
  if (webPackage.name !== "@t3tools/web" || webPackage.version !== "0.0.33") {
    throw new CompatibilityError("compatibility.web_package", webPackagePath);
  }
}

async function transformFile(
  checkoutRoot: string,
  path: string,
  transform: (source: string) => string,
): Promise<string> {
  const source = await readFile(join(checkoutRoot, path), "utf8");
  const output = transform(source);
  const secondOutput = transform(output);
  if (secondOutput !== output) {
    throw new CompatibilityError(
      "compatibility.non_idempotent_transform",
      path,
    );
  }
  return output;
}

async function planModifiedFile(
  checkoutRoot: string,
  path: string,
  transform: (source: string) => string,
  edits: PlannedEdit[],
): Promise<void> {
  const source = await readFile(join(checkoutRoot, path), "utf8");
  const output = await transformFile(checkoutRoot, path, transform);
  if (output !== source) {
    edits.push({
      kind: "modify",
      path,
      expectedBeforeSha256: sha256Text(source),
      content: output,
    });
  }
}

async function planCreatedFile(
  checkoutRoot: string,
  path: string,
  content: string,
  edits: PlannedEdit[],
): Promise<void> {
  try {
    const current = await readFile(join(checkoutRoot, path), "utf8");
    if (current !== content) {
      throw new CompatibilityError("compatibility.created_path_conflict", path);
    }
  } catch (error) {
    if (error instanceof CompatibilityError) throw error;
    if (isMissingFile(error)) edits.push({ kind: "create", path, content });
    else throw error;
  }
}

function transformWebPackage(source: string, frameworkVersion: string): string {
  const packageJson = JSON.parse(source) as { readonly dependencies?: unknown };
  if (
    !packageJson.dependencies ||
    typeof packageJson.dependencies !== "object"
  ) {
    throw new CompatibilityError(
      "compatibility.web_dependencies",
      webPackagePath,
    );
  }
  const current = (packageJson.dependencies as Record<string, unknown>)[
    "@t3code-pets/t3"
  ];
  const expected = `file:../../.t3code-pets/runtime/${frameworkVersion}/t3`;
  if (current === expected) return source;
  if (current !== undefined) {
    throw new CompatibilityError(
      "compatibility.pet_dependency_conflict",
      webPackagePath,
    );
  }
  return applyEdits(
    source,
    modify(source, ["dependencies", "@t3code-pets/t3"], expected, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
        eol: detectEol(source),
      },
    }),
  );
}

function transformViteConfig(source: string): string {
  const ast = parseTypeScript(source);
  const optimizeDepsTargets: N.ObjectExpression[] = [];
  visit(ast, {
    visitObjectExpression(path) {
      for (const property of path.node.properties) {
        if (
          (types.namedTypes.ObjectProperty.check(property) ||
            types.namedTypes.Property.check(property)) &&
          propertyKeyName(property.key) === "optimizeDeps" &&
          types.namedTypes.ObjectExpression.check(property.value)
        ) {
          optimizeDepsTargets.push(property.value);
        }
      }
      this.traverse(path);
    },
  });
  const optimizeDeps = requireSingleNode(
    optimizeDepsTargets,
    "compatibility.vite_optimize_deps_target",
    viteConfigPath,
  );
  const excludeProperties = optimizeDeps.properties.filter(
    (property) =>
      (types.namedTypes.ObjectProperty.check(property) ||
        types.namedTypes.Property.check(property)) &&
      propertyKeyName(property.key) === "exclude",
  );
  if (excludeProperties.length > 1) {
    throw new CompatibilityError(
      "compatibility.vite_exclude_duplicate",
      viteConfigPath,
    );
  }

  let exclude: N.ArrayExpression;
  const existing = excludeProperties[0];
  if (existing) {
    if (
      !(
        types.namedTypes.ObjectProperty.check(existing) ||
        types.namedTypes.Property.check(existing)
      ) ||
      !types.namedTypes.ArrayExpression.check(existing.value)
    ) {
      throw new CompatibilityError(
        "compatibility.vite_exclude_array",
        viteConfigPath,
      );
    }
    exclude = existing.value;
  } else {
    exclude = types.builders.arrayExpression([]);
    optimizeDeps.properties.unshift(
      types.builders.objectProperty(
        types.builders.identifier("exclude"),
        exclude,
      ),
    );
  }

  for (const packageName of [
    "@t3code-pets/core",
    "@t3code-pets/react",
    "@t3code-pets/t3",
  ]) {
    const matches = exclude.elements.filter(
      (element) => stringLiteralValue(element) === packageName,
    );
    if (matches.length > 1) {
      throw new CompatibilityError(
        "compatibility.vite_exclude_package_duplicate",
        packageName,
      );
    }
    if (matches.length === 0) {
      exclude.elements.push(types.builders.stringLiteral(packageName));
    }
  }
  return printTypeScript(ast);
}

function transformSettingsSearch(source: string): string {
  const ast = parseTypeScript(source);
  const aliases: N.TSTypeAliasDeclaration[] = [];
  const labels: N.ObjectExpression[] = [];
  visit(ast, {
    visitTSTypeAliasDeclaration(path) {
      if (path.node.id.name === "SettingsPath") aliases.push(path.node);
      this.traverse(path);
    },
    visitVariableDeclarator(path) {
      if (
        types.namedTypes.Identifier.check(path.node.id) &&
        path.node.id.name === "SETTINGS_SECTION_LABELS" &&
        types.namedTypes.ObjectExpression.check(path.node.init)
      ) {
        labels.push(path.node.init);
      }
      this.traverse(path);
    },
  });
  const alias = requireSingleNode(
    aliases,
    "compatibility.settings_path_target",
    settingsSearchPath,
  );
  if (!types.namedTypes.TSUnionType.check(alias.typeAnnotation)) {
    throw new CompatibilityError(
      "compatibility.settings_path_union",
      settingsSearchPath,
    );
  }
  const pathMembers = alias.typeAnnotation.types.filter(
    (node) =>
      types.namedTypes.TSLiteralType.check(node) &&
      stringLiteralValue(node.literal) === "/settings/pets",
  );
  if (pathMembers.length > 1) {
    throw new CompatibilityError(
      "compatibility.settings_path_duplicate",
      settingsSearchPath,
    );
  }
  if (pathMembers.length === 0) {
    alias.typeAnnotation.types.push(
      types.builders.tsLiteralType(
        types.builders.stringLiteral("/settings/pets"),
      ),
    );
  }

  const labelObject = requireSingleNode(
    labels,
    "compatibility.settings_labels_target",
    settingsSearchPath,
  );
  ensureObjectProperty(
    labelObject,
    "/settings/pets",
    types.builders.stringLiteral("Pets"),
  );
  return printTypeScript(ast);
}

function transformSettingsSidebar(source: string): string {
  const ast = parseTypeScript(source);
  const lucideImports: N.ImportDeclaration[] = [];
  const iconObjects: N.ObjectExpression[] = [];
  visit(ast, {
    visitImportDeclaration(path) {
      if (path.node.source.value === "lucide-react")
        lucideImports.push(path.node);
      this.traverse(path);
    },
    visitVariableDeclarator(path) {
      if (
        types.namedTypes.Identifier.check(path.node.id) &&
        path.node.id.name === "SETTINGS_SECTION_ICONS" &&
        types.namedTypes.ObjectExpression.check(path.node.init)
      ) {
        iconObjects.push(path.node.init);
      }
      this.traverse(path);
    },
  });
  const lucideImport = requireSingleNode(
    lucideImports,
    "compatibility.lucide_import_target",
    settingsSidebarPath,
  );
  const pawImports = lucideImport.specifiers?.filter(
    (specifier) =>
      types.namedTypes.ImportSpecifier.check(specifier) &&
      specifier.imported.name === "PawPrintIcon",
  );
  if ((pawImports?.length ?? 0) > 1) {
    throw new CompatibilityError(
      "compatibility.paw_import_duplicate",
      settingsSidebarPath,
    );
  }
  if ((pawImports?.length ?? 0) === 0) {
    lucideImport.specifiers ??= [];
    lucideImport.specifiers.push(
      types.builders.importSpecifier(types.builders.identifier("PawPrintIcon")),
    );
  }
  const iconObject = requireSingleNode(
    iconObjects,
    "compatibility.settings_icons_target",
    settingsSidebarPath,
  );
  ensureObjectProperty(
    iconObject,
    "/settings/pets",
    types.builders.identifier("PawPrintIcon"),
  );
  return printTypeScript(ast);
}

function transformRootRoute(source: string): string {
  const ast = parseTypeScript(source);
  ensureNamedImport(ast, integrationImport, "T3PetsHost");
  const appShellContainers: N.JSXExpressionContainer[] = [];
  let hostCount = 0;
  visit(ast, {
    visitJSXExpressionContainer(path) {
      if (
        types.namedTypes.Identifier.check(path.node.expression) &&
        path.node.expression.name === "appShell"
      ) {
        appShellContainers.push(path.node);
      }
      this.traverse(path);
    },
    visitJSXElement(path) {
      if (jsxElementName(path.node) === "T3PetsHost") hostCount += 1;
      this.traverse(path);
    },
  });
  if (hostCount > 1) {
    throw new CompatibilityError(
      "compatibility.pet_host_duplicate",
      rootRoutePath,
    );
  }
  const appShell = requireSingleNode(
    appShellContainers,
    "compatibility.app_shell_target",
    rootRoutePath,
  );
  if (hostCount === 0) {
    const parents: N.JSXElement[] = [];
    visit(ast, {
      visitJSXElement(path) {
        if ((path.node.children ?? []).includes(appShell))
          parents.push(path.node);
        this.traverse(path);
      },
    });
    const parent = requireSingleNode(
      parents,
      "compatibility.app_shell_parent",
      rootRoutePath,
    );
    parent.children ??= [];
    const index = parent.children.indexOf(appShell);
    parent.children.splice(
      index + 1,
      0,
      createSelfClosingElement("T3PetsHost"),
    );
  }
  return printTypeScript(ast);
}

function transformChatView(source: string): string {
  const ast = parseTypeScript(source);
  ensureNamedImport(ast, integrationImport, "T3PetsActivityReporter");
  for (const identifier of [
    "threadError",
    "activeLatestTurn",
    "pendingApprovals",
    "pendingUserInputs",
    "isWorking",
  ]) {
    const declarations: N.VariableDeclarator[] = [];
    visit(ast, {
      visitVariableDeclarator(path) {
        if (
          types.namedTypes.Identifier.check(path.node.id) &&
          path.node.id.name === identifier
        ) {
          declarations.push(path.node);
        }
        this.traverse(path);
      },
    });
    requireSingleNode(
      declarations,
      `compatibility.chat_${identifier}_target`,
      chatViewPath,
    );
  }

  let reporterCount = 0;
  const chatRoots: N.JSXElement[] = [];
  visit(ast, {
    visitJSXElement(path) {
      if (jsxElementName(path.node) === "T3PetsActivityReporter")
        reporterCount += 1;
      if (
        jsxElementName(path.node) === "div" &&
        jsxAttributeString(path.node.openingElement, "className")?.startsWith(
          "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
        )
      ) {
        chatRoots.push(path.node);
      }
      this.traverse(path);
    },
  });
  if (reporterCount > 1) {
    throw new CompatibilityError(
      "compatibility.activity_reporter_duplicate",
      chatViewPath,
    );
  }
  const chatRoot = requireSingleNode(
    chatRoots,
    "compatibility.chat_root_target",
    chatViewPath,
  );
  if (reporterCount === 0) {
    chatRoot.children ??= [];
    chatRoot.children.unshift(parseReporterElement());
  }
  return printTypeScript(ast);
}

function ensureNamedImport(
  ast: N.File,
  source: string,
  importedName: string,
): void {
  const imports: N.ImportDeclaration[] = [];
  visit(ast, {
    visitImportDeclaration(path) {
      if (path.node.source.value === source) imports.push(path.node);
      this.traverse(path);
    },
  });
  if (imports.length > 1) {
    throw new CompatibilityError(
      "compatibility.integration_import_duplicate",
      source,
    );
  }
  if (imports.length === 0) {
    ast.program.body.unshift(
      types.builders.importDeclaration(
        [
          types.builders.importSpecifier(
            types.builders.identifier(importedName),
          ),
        ],
        types.builders.stringLiteral(source),
      ),
    );
    return;
  }
  const declaration = imports[0]!;
  const matches = declaration.specifiers?.filter(
    (specifier) =>
      types.namedTypes.ImportSpecifier.check(specifier) &&
      specifier.imported.name === importedName,
  );
  if ((matches?.length ?? 0) > 1) {
    throw new CompatibilityError(
      "compatibility.integration_import_specifier",
      source,
    );
  }
  if ((matches?.length ?? 0) === 0) {
    declaration.specifiers ??= [];
    declaration.specifiers.push(
      types.builders.importSpecifier(types.builders.identifier(importedName)),
    );
  }
}

function ensureObjectProperty(
  object: N.ObjectExpression,
  key: string,
  value: ExpressionKind,
): void {
  const matches = object.properties.filter(
    (property) =>
      (types.namedTypes.ObjectProperty.check(property) ||
        types.namedTypes.Property.check(property)) &&
      stringLiteralValue(property.key) === key,
  );
  if (matches.length > 1) {
    throw new CompatibilityError(
      "compatibility.object_property_duplicate",
      key,
    );
  }
  if (matches.length === 0) {
    object.properties.push(
      types.builders.objectProperty(types.builders.stringLiteral(key), value),
    );
  }
}

function createSelfClosingElement(name: string): N.JSXElement {
  const identifier = types.builders.jsxIdentifier(name);
  return types.builders.jsxElement(
    types.builders.jsxOpeningElement(identifier, [], true),
    null,
    [],
  );
}

function parseReporterElement(): N.JSXElement {
  const snippet = parseTypeScript(`
const reporter = (
  <T3PetsActivityReporter
    isWorking={isWorking}
    hasPendingApproval={pendingApprovals.length > 0}
    hasPendingUserInput={pendingUserInputs.length > 0}
    latestTurnOutcome={
      activeLatestTurn?.state === "completed"
        ? "completed"
        : activeLatestTurn?.state === "interrupted"
          ? "interrupted"
          : activeLatestTurn?.state === "error"
            ? "failed"
            : null
    }
    hasThreadError={Boolean(threadError)}
  />
);
`);
  const declaration = snippet.program.body.find((node) =>
    types.namedTypes.VariableDeclaration.check(node),
  );
  const declarator = declaration?.declarations[0];
  const init = types.namedTypes.VariableDeclarator.check(declarator)
    ? declarator.init
    : null;
  if (!init || !types.namedTypes.JSXElement.check(init)) {
    throw new CompatibilityError(
      "compatibility.reporter_template",
      chatViewPath,
    );
  }
  return init;
}

function parseTypeScript(source: string): N.File {
  return parse(source, { parser: tsParser }) as N.File;
}

function printTypeScript(ast: N.File): string {
  return print(ast, { quote: "double", trailingComma: true }).code;
}

function jsxElementName(element: N.JSXElement): string | null {
  const name = element.openingElement.name;
  return types.namedTypes.JSXIdentifier.check(name) ? name.name : null;
}

function jsxAttributeString(
  element: N.JSXOpeningElement,
  name: string,
): string | null {
  const attribute = (element.attributes ?? []).find(
    (candidate) =>
      types.namedTypes.JSXAttribute.check(candidate) &&
      types.namedTypes.JSXIdentifier.check(candidate.name) &&
      candidate.name.name === name,
  );
  if (!attribute || !types.namedTypes.JSXAttribute.check(attribute))
    return null;
  return stringLiteralValue(attribute.value);
}

function stringLiteralValue(node: N.Node | null | undefined): string | null {
  if (types.namedTypes.StringLiteral.check(node)) return node.value;
  if (types.namedTypes.Literal.check(node) && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function propertyKeyName(node: N.Node | null | undefined): string | null {
  if (types.namedTypes.Identifier.check(node)) return node.name;
  return stringLiteralValue(node);
}

function detectEol(source: string): string {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { readonly code?: string }).code === "ENOENT"
  );
}
