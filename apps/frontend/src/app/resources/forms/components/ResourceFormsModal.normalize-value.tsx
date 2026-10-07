import { FormFieldType } from '@attraccess/react-query-client';
import { FieldValue } from './ResourceFormsModal.field-value';

export function normalizeValue(
  type: FormFieldType,
  rawValue: FieldValue | undefined,
  t: (key: string) => string,
  errors: Record<number, string | null>,
  fieldId: number,
  selectOptions?: string[],
) {
  switch (type) {
    case FormFieldType.TEXT:
      return String(rawValue);
    case FormFieldType.NUMBER: {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        errors[fieldId] = t('modal.numberInvalid');
        return undefined;
      }
      return numericValue;
    }
    case FormFieldType.BOOLEAN:
      return Boolean(rawValue);
    case FormFieldType.SELECT: {
      const value = typeof rawValue === 'string' ? rawValue : '';
      if (!selectOptions?.length) {
        errors[fieldId] = t('modal.selectUnavailable');
        return undefined;
      }
      if (!selectOptions.includes(value)) {
        errors[fieldId] = t('modal.selectInvalid');
        return undefined;
      }
      return value;
    }
    default:
      return rawValue ?? '';
  }
}
