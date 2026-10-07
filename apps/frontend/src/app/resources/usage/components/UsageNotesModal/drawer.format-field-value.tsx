import { FormFieldType } from '@attraccess/react-query-client';

export function formatFieldValue(
  entry: { value: string; fieldDefinition: { type: FormFieldType } },
  t: (key: string) => string,
) {
  switch (entry.fieldDefinition.type) {
    case FormFieldType.BOOLEAN:
      return entry.value === 'true' ? t('booleanYes') : t('booleanNo');
    case FormFieldType.NUMBER:
    case FormFieldType.SELECT:
      return entry.value;
    default:
      return entry.value;
  }
}
