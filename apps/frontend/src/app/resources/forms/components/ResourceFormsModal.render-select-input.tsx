import { Select } from '../../../../components/select';
import { FieldValue } from './ResourceFormsModal.field-value';

export function renderSelectInput(
  options: string[],
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
  fieldName: string,
) {
  const selectedKey = typeof value === 'string' && options.includes(value) ? value : '';

  return (
    <Select
      placeholder={options.length ? t('modal.selectPlaceholder') : t('modal.selectUnavailable')}
      isDisabled={!options.length}
      aria-label={fieldName}
      value={selectedKey}
      onChange={(key) => onChange(key ?? '')}
      items={options.map((option) => ({ key: option, label: option }))}
    />
  );
}
