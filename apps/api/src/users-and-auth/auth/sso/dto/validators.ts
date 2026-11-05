import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsStringArrayRecord(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStringArrayRecord',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be an object where every value is an array of strings`, ...options },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.values(value).every(
            (v) => Array.isArray(v) && (v as unknown[]).every((s) => typeof s === 'string'),
          );
        },
      },
    });
  };
}

export const ROLE_PATH_LIST_MAX_ENTRIES = 20;
export const ROLE_PATH_MAX_LENGTH = 256;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
// lodash `get` walks inherited properties, so these segments would always resolve to "present"
const PROTOTYPE_SEGMENT = /(^|[.[\]'"])(__proto__|constructor|prototype)($|[.[\]'"])/;

export function isValidRolePath(entry: unknown): boolean {
  return (
    typeof entry === 'string' &&
    entry.length > 0 &&
    entry.length <= ROLE_PATH_MAX_LENGTH &&
    entry.trim() === entry &&
    !entry.includes(',') &&
    !CONTROL_CHARACTERS.test(entry) &&
    !PROTOTYPE_SEGMENT.test(entry)
  );
}

/**
 * At most 20 non-blank, trimmed entries of up to 256 characters without commas (the list is stored
 * comma-separated), control characters or prototype-chain segments.
 */
export function IsRolePathList(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRolePathList',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an array of at most ${ROLE_PATH_LIST_MAX_ENTRIES} non-empty, trimmed strings of up to ${ROLE_PATH_MAX_LENGTH} characters without commas, control characters or prototype segments (__proto__, constructor, prototype)`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          return Array.isArray(value) && value.length <= ROLE_PATH_LIST_MAX_ENTRIES && value.every(isValidRolePath);
        },
      },
    });
  };
}
