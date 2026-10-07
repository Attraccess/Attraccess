import { FormFieldType } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { z, ZodError } from 'zod';
import { FieldOptionsPayload, formFieldOptionsSchemaByType } from './form-field-option-schemas';
import { formFieldValueSchemaByType } from './form-field-value-schemas';

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
