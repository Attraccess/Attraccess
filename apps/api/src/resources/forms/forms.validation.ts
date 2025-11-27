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
  z
    .preprocess((value) => normalizeOptionalInput(value), z.coerce.number().optional())
    .refine((value) => value === undefined || !Number.isNaN(value), { message });

const coerceOptionalPositiveNumber = (message: string) =>
  coerceOptionalNumber(message).refine((value) => value === undefined || value > 0, { message });

const coerceOptionalDate = (message: string) =>
  z
    .preprocess((value) => normalizeOptionalInput(value), z.coerce.date().optional())
    .refine((value) => value === undefined || !Number.isNaN(value.getTime()), { message })
    .transform((value) => value ?? undefined);

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

const createIsoDateOptionSchema = (optionName: string) =>
  coerceOptionalDate(`Datetime field ${optionName} option must be a valid ISO date.`).transform((value) =>
    value ? value.toISOString() : undefined,
  );

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

const datetimeFieldOptionsSchema = z
  .object({
    earliest: createIsoDateOptionSchema('earliest'),
    latest: createIsoDateOptionSchema('latest'),
  })
  .superRefine((value, ctx) => {
    if (value.earliest && value.latest && new Date(value.earliest) > new Date(value.latest)) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: 'Datetime field earliest option cannot be after latest.',
        path: ['earliest'],
      });
    }
  })
  .transform((value) => {
    if (!value.earliest && !value.latest) {
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

const formFieldOptionsSchemaByType: Record<FormFieldType, z.ZodType<Record<string, unknown> | null>> = {
  [FormFieldType.TEXT]: textFieldOptionsSchema,
  [FormFieldType.NUMBER]: numberFieldOptionsSchema,
  [FormFieldType.DATETIME]: datetimeFieldOptionsSchema,
  [FormFieldType.BOOLEAN]: booleanFieldOptionsSchema,
};

const textFieldValueSchema = z.custom<string>((value) => typeof value === 'string', {
  message: 'Text field values must be strings.',
});

const numberFieldValueSchema = z
  .preprocess((value) => normalizeOptionalInput(value), z.coerce.number())
  .refine((value) => !Number.isNaN(value), { message: 'Number field values must be numeric.' })
  .transform((value) => value.toString());

const datetimeFieldValueSchema = z
  .preprocess((value) => normalizeOptionalInput(value), z.coerce.date())
  .refine((value) => !Number.isNaN(value.getTime()), {
    message: 'Datetime field values must be valid ISO strings.',
  })
  .transform((value) => value.toISOString());

const booleanFieldValueSchema = z
  .custom<
    boolean | 'true' | 'false'
  >((value) => value === true || value === false || value === 'true' || value === 'false', { message: 'Boolean field values must be true or false.' })
  .transform((value) => (value === true || value === 'true' ? 'true' : 'false'));

const formFieldValueSchemaByType: Record<FormFieldType, z.ZodType<string>> = {
  [FormFieldType.TEXT]: textFieldValueSchema,
  [FormFieldType.NUMBER]: numberFieldValueSchema,
  [FormFieldType.DATETIME]: datetimeFieldValueSchema,
  [FormFieldType.BOOLEAN]: booleanFieldValueSchema,
};

const parseWithSchema = <T>(schema: z.ZodType<T>, payload: unknown, fallbackMessage: string): T => {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const message =
        firstIssue?.code === ZodIssueCode.invalid_type && firstIssue.expected === 'date'
          ? fallbackMessage
          : (firstIssue?.message ?? fallbackMessage);
      throw new BadRequestException(message);
    }
    throw error;
  }
};

export const parseFieldOptions = (
  type: FormFieldType,
  options: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
  const schema = formFieldOptionsSchemaByType[type];
  if (!schema) {
    return null;
  }
  return parseWithSchema(schema, options ?? {}, 'Invalid field options payload.');
};

export const parseFieldValue = (type: FormFieldType, rawValue: unknown): string => {
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
      case FormFieldType.DATETIME:
        return 'Datetime field values must be valid ISO strings.';
      case FormFieldType.BOOLEAN:
        return 'Boolean field values must be true or false.';
      default:
        return `Invalid value for field type ${type}`;
    }
  })();
  return parseWithSchema(schema, rawValue, fallbackMessage);
};

export const fieldOptionsSchemas = formFieldOptionsSchemaByType;
export const fieldValueSchemas = formFieldValueSchemaByType;
