export interface PetValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly PetValidationIssue[] };

export function validationFailure(
  code: string,
  message: string,
  path = "",
): ValidationResult<never> {
  return { ok: false, issues: [{ code, path, message }] };
}
