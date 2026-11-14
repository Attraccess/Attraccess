import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { Input, Label, ListBox, Select, TextField } from '@heroui/react';
import { useWagoTranslations } from '../../i18n';

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <Select
      value={value || null}
      onChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      placeholder={t('channels.select')}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

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

export const options = <T extends string>(values: readonly T[], t: TFunction) =>
  values.map((id) => ({ id, label: t(`channels.${id}`) }));
