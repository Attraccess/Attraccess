import { FormFieldType } from '@attraccess/database-entities';
import { z } from 'zod';
export const normalizeOptionalInput = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }
  return value;
};
export const textFieldValueSchema = z.custom<string>((value) => typeof value === 'string', {
  message: 'Text field values must be strings.',
});
export const numberFieldValueSchema = z
  .preprocess((value) => normalizeOptionalInput(value), z.coerce.number())
  .refine((value) => !Number.isNaN(value), { message: 'Number field values must be numeric.' })
  .transform((value) => value.toString());
export const booleanFieldValueSchema = z
  .custom<boolean | 'true' | 'false'>(
    (value) => value === true || value === false || value === 'true' || value === 'false',
    { message: 'Boolean field values must be true or false.' },
  )
  .transform((value) => (value === true || value === 'true' ? 'true' : 'false'));
export const selectFieldValueSchema = z.custom<string>((value) => typeof value === 'string', {
  message: 'Select field values must be strings.',
});
export const formFieldValueSchemaByType: Record<FormFieldType, z.ZodType<string>> = {
  [FormFieldType.TEXT]: textFieldValueSchema,
  [FormFieldType.NUMBER]: numberFieldValueSchema,
  [FormFieldType.BOOLEAN]: booleanFieldValueSchema,
  [FormFieldType.SELECT]: selectFieldValueSchema,
};
