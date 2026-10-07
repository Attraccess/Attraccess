import { Label } from '@heroui/react';
import { ListBox } from '@heroui/react';
import { Select } from '@heroui/react';
import { useWagoTranslations } from './i18n';
import { Input } from '@heroui/react';
import { TextField } from '@heroui/react';
import { useState } from 'react';
import { Description } from '@heroui/react';
import type { RegisterFormat } from '../../modbus/model';

export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
  labels = {},
}: {
  label: string;
  value: string | number;
  labels?: Record<string, string>;
  options: readonly (string | number)[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t, tExists } = useWagoTranslations();
  const optionLabel = (option: string | number) =>
    labels[String(option)] ?? (tExists(`modbus.options.${option}`) ? t(`modbus.options.${option}`) : String(option));
  return (
    <Select isDisabled={disabled} value={String(value)} onChange={(key) => key !== null && onChange(String(key))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={String(option)} key={option} textValue={optionLabel(option)}>
              {optionLabel(option)}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

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

export function FormatFields({
  value,
  onChange,
  disabled,
}: {
  value: RegisterFormat;
  onChange: (value: RegisterFormat) => void;
  disabled: boolean;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
      {(['address', 'scale', 'offset'] as const).map((key) => (
        <Field
          key={key}
          label={t(`modbus.${key}`)}
          value={value[key]}
          numeric
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [key]: Number(v) })}
        />
      ))}
      <Choice
        label={t('modbus.addressConvention')}
        value={value.addressBase}
        options={[0, 1]}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, addressBase: Number(v) as 0 | 1 })}
      />
      <Choice
        label={t('modbus.dataType')}
        value={value.dataType}
        options={['uint16', 'int16', 'uint32', 'int32', 'float32']}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, dataType: v as RegisterFormat['dataType'] })}
      />
      {(['byteOrder', 'wordOrder'] as const).map((key) => (
        <Choice
          key={key}
          label={t(`modbus.${key}`)}
          value={value[key]}
          options={['big', 'little']}
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      <Description>{t('modbus.formatHint')}</Description>
    </div>
  );
}
