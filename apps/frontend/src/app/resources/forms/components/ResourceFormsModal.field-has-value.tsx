import { FormFieldType } from '@attraccess/react-query-client';
import { FieldValue } from './ResourceFormsModal.field-value';

export function fieldHasValue(type: FormFieldType, value: FieldValue | undefined) {
  if (type === FormFieldType.BOOLEAN) {
    return typeof value === 'boolean';
  }
  if (type === FormFieldType.SELECT) {
    return typeof value === 'string' && value.trim().length > 0;
  }
  return Boolean(value && String(value).trim().length > 0);
}
