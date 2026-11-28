import {
  Description,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';

interface MillimetreFieldProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  limits: { min: number; max: number; step: number };
  'data-cy'?: string;
}

/** A stepper for one length in millimetres, clamped to `limits`. */
export function MillimetreField({ label, description, value, onChange, limits, ...props }: MillimetreFieldProps) {
  return (
    <NumberField
      value={value}
      // An emptied field reports NaN; keep the last valid length instead.
      onChange={(next) => !Number.isNaN(next) && onChange(next)}
      minValue={limits.min}
      maxValue={limits.max}
      step={limits.step}
      formatOptions={{
        style: 'unit',
        unit: 'millimeter',
        // 0.1 mm steps always show their decimal (17.8 mm); half-millimetre steps only when needed.
        minimumFractionDigits: limits.step < 0.5 ? 1 : 0,
        maximumFractionDigits: 2,
      }}
      data-cy={props['data-cy']}
    >
      <Label>{label}</Label>
      <NumberFieldGroup>
        <NumberFieldDecrementButton />
        <NumberFieldInput />
        <NumberFieldIncrementButton />
      </NumberFieldGroup>
      <Description>{description}</Description>
    </NumberField>
  );
}
