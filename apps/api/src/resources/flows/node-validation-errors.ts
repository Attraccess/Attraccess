import { ZodError } from 'zod';

/** `required`: the value is missing. `invalid`: any other problem. */
export type ValidationErrorCode = 'required' | 'invalid';

export const VALIDATION_ERROR_CODES: readonly ValidationErrorCode[] = ['required', 'invalid'];

export interface NodeFieldError {
  field: string;
  code: ValidationErrorCode;
  message: string;
}

export const REQUIRED_FIELD_MESSAGE = 'This field is required.';
export const INVALID_NODE_CONFIGURATION_MESSAGE = 'Invalid node configuration';

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (value, key) =>
      value !== null && typeof value === 'object' ? (value as Record<PropertyKey, unknown>)[key] : undefined,
    data,
  );
}

/**
 * Turns a schema error into one short, JSON-free error per issue. A missing value is reported
 * as `required`; Zod 4 issues do not carry their input, so the value is looked up in `data`.
 */
export function zodErrorToFieldErrors(error: ZodError, data: unknown): NodeFieldError[] {
  return error.issues.map((issue) => {
    const required = issue.code === 'invalid_type' && valueAt(data, issue.path) === undefined;
    return {
      field: issue.path.map(String).join('.') || 'data',
      code: required ? 'required' : 'invalid',
      message: required ? REQUIRED_FIELD_MESSAGE : issue.message,
    };
  });
}
