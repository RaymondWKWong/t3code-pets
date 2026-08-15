import { createHash } from "node:crypto";

export interface CompatibilityIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type PlannedEdit =
  | {
      readonly kind: "create";
      readonly path: string;
      readonly content: string | Uint8Array;
    }
  | {
      readonly kind: "modify";
      readonly path: string;
      readonly expectedBeforeSha256: string;
      readonly content: string | Uint8Array;
    };

export interface CompatibilityAdapter {
  readonly id: string;
  readonly t3Version: string;
  inspect(checkoutRoot: string): Promise<readonly CompatibilityIssue[]>;
  plan(
    checkoutRoot: string,
    frameworkVersion: string,
  ): Promise<readonly PlannedEdit[]>;
}

export class CompatibilityError extends Error {
  readonly code: string;
  readonly path: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    path: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${path}`);
    this.name = "CompatibilityError";
    this.code = code;
    this.path = path;
    this.details = details;
  }
}

export function requireSingleNode<T>(
  nodes: readonly T[],
  issueCode: string,
  path: string,
): T {
  if (nodes.length !== 1) {
    throw new CompatibilityError(issueCode, path, {
      expectedMatches: 1,
      actualMatches: nodes.length,
    });
  }
  return nodes[0]!;
}

export function sha256Text(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
