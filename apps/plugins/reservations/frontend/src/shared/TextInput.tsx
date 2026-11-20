import { Description, Input, Label, TextField } from '@heroui/react';
import type { ReactNode } from 'react';

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  /** Native `min`/`max`, e.g. the `YYYY-MM-DD` limits of a date input. */
  min?: string;
  max?: string;
  isRequired?: boolean;
  description?: ReactNode;
  'data-cy'?: string;
}) {
  const { label, value, onChange, type, placeholder, maxLength, min, max, isRequired, description } = props;
  return (
    <TextField value={value} onChange={onChange} isRequired={isRequired} type={type}>
      <Label>{label}</Label>
      <Input
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        max={max}
        data-cy={props['data-cy']}
        autoComplete="off"
      />
      {description && <Description>{description}</Description>}
    </TextField>
  );
}
