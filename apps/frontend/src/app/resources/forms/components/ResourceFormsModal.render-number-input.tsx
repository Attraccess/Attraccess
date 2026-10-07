import { TextField, FieldError, Input } from '@heroui/react';
import { NumberFieldOptions } from '../../details/forms/types';
import { FieldValue } from './ResourceFormsModal.field-value';

export function renderNumberInput(
  options: NumberFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  const min = typeof options.min === 'number' ? options.min : undefined;
  const max = typeof options.max === 'number' ? options.max : undefined;
  const step = typeof options.step === 'number' ? options.step : undefined;

  return (
    <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
      <Input type="number" min={min} max={max} step={step} />
      {error && <FieldError>{error}</FieldError>}
    </TextField>
  );
}
