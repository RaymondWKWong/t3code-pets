import type { PetManifestV1, PetValidationIssue } from "@t3code-pets/core";

import type { PetSize } from "./petSize.js";

export interface InstalledPetSummary {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly petVersion: string;
  readonly thumbnailPath: string;
}

export interface InstalledPet {
  readonly manifest: PetManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface PetPreferences {
  readonly cursorCuriosity: boolean;
  readonly enabled: boolean;
  readonly petSize: PetSize;
  readonly selectedPetId: string | null;
  readonly position: { readonly x: number; readonly y: number } | null;
}

export interface PetInstallOptions {
  readonly allowVersionDowngrade?: boolean;
}

export interface PetStore {
  list(): Promise<readonly InstalledPetSummary[]>;
  get(id: string): Promise<InstalledPet | null>;
  readAsset(id: string, path: string): Promise<Uint8Array | null>;
  install(
    bytes: Uint8Array,
    options?: PetInstallOptions,
  ): Promise<InstalledPetSummary>;
  remove(id: string): Promise<void>;
  readPreferences(): Promise<PetPreferences>;
  writePreferences(preferences: PetPreferences): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export class PetStoreError extends Error {
  readonly code: string;
  readonly issues: readonly PetValidationIssue[];

  constructor(
    code: string,
    message: string,
    issues: readonly PetValidationIssue[] = [],
  ) {
    super(message);
    this.name = "PetStoreError";
    this.code = code;
    this.issues = issues;
  }
}
