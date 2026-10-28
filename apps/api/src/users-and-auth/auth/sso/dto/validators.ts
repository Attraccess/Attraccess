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
          return Object.values(value).every((v) => Array.isArray(v) && (v as unknown[]).every((s) => typeof s === 'string'));
        },
      },
    });
  };
}
