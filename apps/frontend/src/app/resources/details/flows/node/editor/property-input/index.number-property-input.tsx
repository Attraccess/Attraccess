import {
  Description,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { Select } from '../../../../../../../components/select';
import { getNumberFieldMinimum } from './number-field-minimum';
import { PropertyViewProps } from './index.property-view-props';
import { EnumValue } from './index.enum-value';

export function NumberPropertyInput<TValue>(
  props: PropertyViewProps<TValue> & {
    enumLabel: (item: EnumValue) => string;
    parsedValue: TValue | number;
    setValue: (value: TValue) => void;
  },
) {
  const { name, schema, value, isRequired, hideLabel, label, description, onChange, enumLabel, parsedValue, setValue } =
    props;
  const propertyKey = name.split('.').pop();
  const isQosField = propertyKey === 'qos' || propertyKey === 'subscribeQos';
  const enumValues: EnumValue[] | undefined =
    schema.oneOf ??
    schema.enum?.map((enumValue) => ({ const: enumValue })) ??
    (isQosField ? [0, 1, 2].map((enumValue) => ({ const: enumValue })) : undefined);

  if (enumValues) {
    const isCompatible = enumValues.some((item) => String(item.const) === String(value));
    const selectedValue = isCompatible ? String(value) : '';

    return (
      <Select
        isRequired={isRequired}
        isInvalid={value !== undefined && !isCompatible}
        label={!hideLabel ? label : undefined}
        aria-label={label}
        value={selectedValue}
        onChange={(newValue) => {
          if (newValue == null) return;
          setValue(Number(newValue) as TValue);
        }}
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

  return (
    <NumberField
      isRequired={isRequired}
      aria-label={label}
      value={Number(parsedValue)}
      onChange={(newValue) => {
        if (!isRequired && Number.isNaN(newValue)) onChange(undefined as TValue);
        else setValue(newValue as TValue);
      }}
      minValue={getNumberFieldMinimum(schema)}
      maxValue={schema.maximum}
      step={schema.multipleOf}
    >
      {!hideLabel && <Label>{label}</Label>}
      {description && <Description className="whitespace-pre-wrap">{description}</Description>}
      <NumberFieldGroup>
        <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
        <NumberFieldInput />
        <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
      </NumberFieldGroup>
    </NumberField>
  );
}
