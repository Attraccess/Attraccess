import { FormFieldType } from '@attraccess/database-entities';
import { z, ZodIssueCode } from 'zod';
import { normalizeOptionalInput } from './form-field-value-schemas';
export const coerceOptionalNumber = (message: string) =>
  z.optional(
    z
      .preprocess((value) => normalizeOptionalInput(value), z.coerce.number().optional())
      .refine((value) => value === undefined || !Number.isNaN(value), { message }),
  );
export const coerceOptionalPositiveNumber = (message: string) =>
  z.optional(
    z
      .preprocess((value) => normalizeOptionalInput(value), z.coerce.number().optional())
      .refine((value) => value === undefined || !Number.isNaN(value), { message })
      .refine((value) => value === undefined || (value as number) > 0, { message }),
  );
export const optionalTrimmedString = z
  .preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, z.string())
  .optional();
export const createNumericOptionSchema = (message: string) => coerceOptionalNumber(message);
export const createPositiveNumericOptionSchema = (message: string) => coerceOptionalPositiveNumber(message);
export const textFieldOptionsSchema = z
  .object({
    placeholder: optionalTrimmedString,
    multiline: z.boolean().optional(),
  })
  .transform((value) => {
    if (value.placeholder === undefined && value.multiline === undefined) {
      return null;
    }
    return value;
  });
export const numberFieldOptionsSchema = z
  .object({
    min: createNumericOptionSchema('Number field min option must be numeric.'),
    max: createNumericOptionSchema('Number field max option must be numeric.'),
    step: createPositiveNumericOptionSchema('Number field step option must be a positive number.'),
  })
  .superRefine((value, ctx) => {
    if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: 'Number field min option cannot be greater than max.',
        path: ['min'],
      });
    }
  })
  .transform((value) => {
    if (value.min === undefined && value.max === undefined && value.step === undefined) {
      return null;
    }
    return value;
  });
export const booleanFieldOptionsSchema = z
  .object({
    trueLabel: optionalTrimmedString,
    falseLabel: optionalTrimmedString,
  })
  .transform((value) => {
    if (value.trueLabel === undefined && value.falseLabel === undefined) {
      return null;
    }
    return value;
  });
export const MAX_SELECT_OPTIONS = 12;
export const selectOptionsArraySchema = z
  .array(
    z.preprocess((value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }
      return value;
    }, z.string()),
  )
  .min(1, 'Select fields must contain at least one option.')
  .max(MAX_SELECT_OPTIONS, `Select fields can have at most ${MAX_SELECT_OPTIONS} options.`)
  .transform((value) => {
    const unique: string[] = [];
    value.forEach((option) => {
      if (!unique.includes(option)) {
        unique.push(option);
      }
    });
    return unique;
  });
export const selectFieldOptionsSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'object' && Array.isArray((value as { options?: unknown }).options)) {
      return (value as { options?: unknown }).options;
    }
    return value;
  }, selectOptionsArraySchema)
  .transform((value) => (value.length ? value : null));
export type FieldOptionsPayload = Record<string, unknown> | string[] | null;
export const formFieldOptionsSchemaByType: Record<FormFieldType, z.ZodType<FieldOptionsPayload>> = {
  [FormFieldType.TEXT]: textFieldOptionsSchema,
  [FormFieldType.NUMBER]: numberFieldOptionsSchema,
  [FormFieldType.BOOLEAN]: booleanFieldOptionsSchema,
  [FormFieldType.SELECT]: selectFieldOptionsSchema,
};
