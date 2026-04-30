import { FormFieldType } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { z, ZodError, ZodIssueCode } from 'zod';

const normalizeOptionalInput = (value: unknown) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }
  return value;
};

const coerceOptionalNumber = (message: string) =>
  z.optional(
    z
      .preprocess((value) => normalizeOptionalInput(value), z.coerce.number().optional())
      .refine((value) => value === undefined || !Number.isNaN(value), { message })
  );

const coerceOptionalPositiveNumber = (message: string) =>
  z.optional(
    z
      .preprocess((value) => normalizeOptionalInput(value), z.coerce.number().optional())
      .refine((value) => value === undefined || !Number.isNaN(value), { message })
      .refine((value) => value === undefined || (value as number) > 0, { message })
  );

const optionalTrimmedString = z
  .preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, z.string())
  .optional();

const createNumericOptionSchema = (message: string) => coerceOptionalNumber(message);

const createPositiveNumericOptionSchema = (message: string) => coerceOptionalPositiveNumber(message);

const textFieldOptionsSchema = z
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

const numberFieldOptionsSchema = z
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

const booleanFieldOptionsSchema = z
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

const MAX_SELECT_OPTIONS = 12;

const selectOptionsArraySchema = z
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

const selectFieldOptionsSchema = z
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

type FieldOptionsPayload = Record<string, unknown> | string[] | null;

const formFieldOptionsSchemaByType: Record<FormFieldType, z.ZodType<FieldOptionsPayload>> = {
  [FormFieldType.TEXT]: textFieldOptionsSchema,
  [FormFieldType.NUMBER]: numberFieldOptionsSchema,
  [FormFieldType.BOOLEAN]: booleanFieldOptionsSchema,
  [FormFieldType.SELECT]: selectFieldOptionsSchema,
};

const textFieldValueSchema = z.custom<string>((value) => typeof value === 'string', {
  message: 'Text field values must be strings.',
});

const numberFieldValueSchema = z
  .preprocess((value) => normalizeOptionalInput(value), z.coerce.number())
  .refine((value) => !Number.isNaN(value), { message: 'Number field values must be numeric.' })
  .transform((value) => value.toString());

const booleanFieldValueSchema = z
  .custom<
    boolean | 'true' | 'false'
  >((value) => value === true || value === false || value === 'true' || value === 'false', { message: 'Boolean field values must be true or false.' })
  .transform((value) => (value === true || value === 'true' ? 'true' : 'false'));

const selectFieldValueSchema = z.custom<string>((value) => typeof value === 'string', {
  message: 'Select field values must be strings.',
});

const formFieldValueSchemaByType: Record<FormFieldType, z.ZodType<string>> = {
  [FormFieldType.TEXT]: textFieldValueSchema,
  [FormFieldType.NUMBER]: numberFieldValueSchema,
  [FormFieldType.BOOLEAN]: booleanFieldValueSchema,
  [FormFieldType.SELECT]: selectFieldValueSchema,
};

const parseWithSchema = <T>(schema: z.ZodType<T>, payload: unknown, fallbackMessage: string): T => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const message = firstIssue?.message ?? fallbackMessage;
      throw new BadRequestException(message);
    }
    throw error;
  }
};

export const parseFieldOptions = (type: FormFieldType, options: unknown): FieldOptionsPayload => {
  const schema = formFieldOptionsSchemaByType[type];
  if (!schema) {
    return null;
  }
  const fallbackInput = type === FormFieldType.SELECT ? [] : {};
  return parseWithSchema(schema, options ?? fallbackInput, 'Invalid field options payload.');
};

export const parseFieldValue = (type: FormFieldType, rawValue: unknown, options?: FieldOptionsPayload): string => {
  const schema = formFieldValueSchemaByType[type];
  if (!schema) {
    throw new BadRequestException(`Unsupported field type ${type}`);
  }
  const fallbackMessage = (() => {
    switch (type) {
      case FormFieldType.TEXT:
        return 'Text field values must be strings.';
      case FormFieldType.NUMBER:
        return 'Number field values must be numeric.';
      case FormFieldType.BOOLEAN:
        return 'Boolean field values must be true or false.';
      case FormFieldType.SELECT:
        return 'Select field values must match one of the available options.';
      default:
        return `Invalid value for field type ${type}`;
    }
  })();
  const normalized = parseWithSchema(schema, rawValue, fallbackMessage);
  if (type === FormFieldType.SELECT) {
    const allowed = Array.isArray(options) ? options : null;
    if (!allowed?.length) {
      throw new BadRequestException('Select field has no configured options.');
    }
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('Select field values must match one of the available options.');
    }
  }
  return normalized;
};

export const fieldOptionsSchemas = formFieldOptionsSchemaByType;
export const fieldValueSchemas = formFieldValueSchemaByType;
