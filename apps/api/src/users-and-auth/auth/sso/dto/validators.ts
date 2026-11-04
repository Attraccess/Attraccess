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

/** At most 20 non-blank entries of up to 256 characters, none containing a comma (the list is stored comma-separated). */
export function IsRolePathList(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRolePathList',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an array of at most ${ROLE_PATH_LIST_MAX_ENTRIES} non-empty strings of up to ${ROLE_PATH_MAX_LENGTH} characters without commas`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          return (
            Array.isArray(value) &&
            value.length <= ROLE_PATH_LIST_MAX_ENTRIES &&
            value.every(
              (entry) =>
                typeof entry === 'string' &&
                entry.trim().length > 0 &&
                entry.length <= ROLE_PATH_MAX_LENGTH &&
                !entry.includes(','),
            )
          );
        },
      },
    });
  };
}
