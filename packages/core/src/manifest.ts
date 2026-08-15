import { z } from "zod";

import type { PetValidationIssue, ValidationResult } from "./result.js";

export const PET_PACKAGE_LIMITS = {
  maxEntries: 16,
  maxCompressedBytes: 25 * 1024 * 1024,
  maxExtractedBytes: 64 * 1024 * 1024,
  atlasWidth: 1536,
  atlasHeight: 2288,
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rows: 11,
} as const;

const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const webpFilenameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.webp$/)
  .refine((value) => value !== "." && value !== "..", {
    message: "Must be a safe WebP filename",
  });

const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    displayName: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    petVersion: z.string().regex(semanticVersionPattern),
    spriteVersionNumber: z.literal(2),
    atlases: z
      .object({
        left: webpFilenameSchema,
        right: webpFilenameSchema,
      })
      .strict(),
    thumbnail: webpFilenameSchema,
    timingProfile: z.literal("codex-v2"),
  })
  .strict();

export type PetManifestV1 = z.infer<typeof manifestSchema>;

export function parsePetManifest(
  input: unknown,
): ValidationResult<PetManifestV1> {
  const result = manifestSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  return {
    ok: false,
    issues: result.error.issues.map(toValidationIssue),
  };
}

function toValidationIssue(issue: z.core.$ZodIssue): PetValidationIssue {
  const unrecognizedKey =
    issue.code === "unrecognized_keys" ? issue.keys[0] : undefined;
  const path = [...issue.path, ...(unrecognizedKey ? [unrecognizedKey] : [])]
    .map(String)
    .join(".");

  return {
    code:
      issue.code === "unrecognized_keys"
        ? "manifest.unrecognized_key"
        : `manifest.${issue.code}`,
    path,
    message: issue.message,
  };
}
