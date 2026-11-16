import { Label, ListBox, Select } from '@heroui/react';
import { useWagoTranslations } from '../../i18n';

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
