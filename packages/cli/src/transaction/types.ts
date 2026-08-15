export interface ManagedFileState {
  readonly path: string;
  readonly kind: "created" | "modified";
  readonly beforeSha256: string | null;
  readonly afterSha256: string;
  readonly backupRelativePath: string | null;
}

export interface InstallationMetadata {
  readonly frameworkVersion: string;
  readonly adapterId: string;
  readonly t3Version: string;
  readonly t3Commit: string;
}

export interface InstallationState extends InstallationMetadata {
  readonly schemaVersion: 1;
  readonly installedAt: string;
  readonly files: readonly ManagedFileState[];
}

export interface TransactionJournal {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly startedAt: string;
  readonly metadata: InstallationMetadata;
  readonly files: readonly ManagedFileState[];
  readonly appliedPaths: readonly string[];
}
