import { Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';

export function Field({
  label,
  value,
  onChange,
  numeric = false,
  allowEmpty = false,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  numeric?: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const display = Number.isNaN(value) ? '' : String(value);
  // Keep incomplete numeric text only while it still represents our own emitted value.
  // An authoritative replacement must take precedence, including while focused.
  const [edit, setEdit] = useState<{ text: string; value: string | number } | null>(null);
  const currentEdit = edit && Object.is(edit.value, value) ? edit : null;
  if (edit && !currentEdit) setEdit(null);
  return (
    <TextField
      isDisabled={disabled}
      isInvalid={numeric && Number.isNaN(value)}
      value={currentEdit?.text ?? display}
      onBlur={() => setEdit(null)}
      onChange={(text) => {
        const emitted = numeric && !allowEmpty && text.trim() === '' ? 'NaN' : text;
        setEdit({ text, value: numeric && !(allowEmpty && text === '') ? Number(emitted) : emitted });
        onChange(emitted);
      }}
    >
      <Label>{label}</Label>
      <Input type="text" inputMode={numeric ? 'decimal' : undefined} />
    </TextField>
  );
}
