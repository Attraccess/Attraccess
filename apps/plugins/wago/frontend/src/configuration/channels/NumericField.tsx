import { Input, Label, TextField } from '@heroui/react';

export function NumericField({
  label,
  value,
  onChange,
  min,
  max,
  integer = true,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  return (
    <TextField isRequired>
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={integer ? 1 : 'any'}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      />
    </TextField>
  );
}
