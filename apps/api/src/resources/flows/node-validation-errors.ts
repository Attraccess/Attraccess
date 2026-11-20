import { ZodError } from 'zod';

export const VALIDATION_ERROR_CODES = ['required', 'invalid'] as const;

/** `required`: the value is missing. `invalid`: any other problem. */
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

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

/** Empty like the editor sees it (`isValueValid` in the frontend property inputs). */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Turns a schema error into one short, JSON-free error per issue. A missing (undefined, null or
 * empty) value is reported as `required`, whatever the issue code (Zod 4 reports a missing enum as
 * `invalid_value`, not `invalid_type`); its issues do not carry their input, so the value is looked
 * up in `data`.
 */
export function zodErrorToFieldErrors(error: ZodError, data: unknown): NodeFieldError[] {
  return error.issues.map((issue) => {
    const required = isMissing(valueAt(data, issue.path));
    return {
      field: issue.path.map(String).join('.') || 'data',
      code: required ? 'required' : 'invalid',
      message: required ? REQUIRED_FIELD_MESSAGE : issue.message,
    };
  });
}
