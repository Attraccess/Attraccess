// Form primitives specific to the Shelly plugin's drawers.
import { Input, Label, TextField } from '@heroui/react';
import type { ReactNode } from 'react';

export function TextFieldRow({
  label,
  value,
  onChange,
  placeholder,
  required,
  description,
  dataCy,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  description?: ReactNode;
  dataCy?: string;
}) {
  return (
    <TextField value={value} onChange={onChange} isRequired={required}>
      <Label>{label}</Label>
      <Input placeholder={placeholder} autoComplete="off" data-cy={dataCy} />
      {description && <p className="sh:mt-1 sh:text-xs sh:text-muted">{description}</p>}
    </TextField>
  );
}
