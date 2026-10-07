import { Select } from '../../../../components/select';
import type { FieldValue } from './ResourceFormsModal.contracts';
import { TextField } from '@heroui/react';
import { FieldError } from '@heroui/react';
import { Input } from '@heroui/react';
import { TextArea } from '@heroui/react';
import { TextFieldOptions } from '../../details/forms/types';

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

export function renderTextInput(
  options: TextFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  if (options.multiline) {
    return (
      <div className="space-y-1">
        <TextArea
          value={(value as string) ?? ''}
          placeholder={options.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error && (
          <p className="flex items-start gap-1 text-sm font-medium text-danger">
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
      <Input placeholder={options.placeholder ?? ''} />
      {error && <FieldError>{error}</FieldError>}
    </TextField>
  );
}
