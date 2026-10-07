import { type ValidationError } from './runtime-types';

export function validateKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: string[],
  errors: ValidationError[],
): void {
  Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .forEach((key) =>
      errors.push({
        path: `${path}.${key}`,
        code: 'unknown_field',
        message: 'field is not supported by configuration version 1',
      }),
    );
}
