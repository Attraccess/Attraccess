import { Description, Input, Label, TextArea, TextField } from '@heroui/react';
import { Select } from '../../../../../../../components/select';
import { PropertyViewProps } from './index.property-view-props';
import { EnumValue } from './index.enum-value';

export function StringPropertyInput<TValue>(
  props: PropertyViewProps<TValue> & { enumLabel: (item: EnumValue) => string },
) {
  const { name, nodeType, schema, value, isRequired, hideLabel, label, description, onChange, enumLabel } = props;
  if (schema.enum || schema.oneOf) {
    const enumValues: EnumValue[] = schema.oneOf ?? schema.enum?.map((enumValue) => ({ const: enumValue })) ?? [];
    const isCompatible = enumValues.some((item) => String(item.const) === String(value));
    return (
      <Select
        isRequired={isRequired}
        isInvalid={value !== undefined && !isCompatible}
        label={!hideLabel ? label : undefined}
        aria-label={label}
        value={isCompatible ? String(value) : ''}
        onChange={(newValue) => onChange(newValue as TValue)}
        description={
          <span className="whitespace-pre-wrap">
            {description}
            {value !== undefined && !isCompatible ? <span> Select an available option.</span> : null}
          </span>
        }
        items={enumValues.map((enumValue) => ({
          key: String(enumValue.const),
          label: enumLabel(enumValue),
        }))}
      />
    );
  }

  if (schema.stringVariant === 'multiline') {
    const multilineLabel = label;
    const multilineId = `property-input-${nodeType}-${name}`;
    return (
      <div className="flex flex-col gap-2 w-full">
        {!hideLabel && <Label htmlFor={multilineId}>{multilineLabel}</Label>}
        <TextArea
          id={multilineId}
          aria-label={multilineLabel}
          required={isRequired}
          placeholder={hideLabel ? multilineLabel : undefined}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value as TValue)}
        />
        {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      </div>
    );
  }

  return (
    <TextField
      isRequired={isRequired}
      value={value ? String(value) : ''}
      onChange={(newValue) => onChange(newValue as TValue)}
    >
      {!hideLabel && <Label>{label}</Label>}
      {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      <Input type="text" placeholder={hideLabel ? label : undefined} />
    </TextField>
  );
}
