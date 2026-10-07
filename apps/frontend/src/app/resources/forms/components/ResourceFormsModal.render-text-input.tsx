import { TextField, FieldError, Input, TextArea } from '@heroui/react';
import { TextFieldOptions } from '../../details/forms/types';
import { FieldValue } from './ResourceFormsModal.field-value';

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
