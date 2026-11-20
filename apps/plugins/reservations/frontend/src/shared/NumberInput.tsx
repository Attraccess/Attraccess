import {
  Description,
  FieldError,
  Label,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import type { ReactNode } from 'react';

export function NumberInput(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  description?: ReactNode;
  /** Shown instead of the description while set. HeroUI hides the description of invalid fields. */
  errorMessage?: ReactNode;
  'data-cy'?: string;
}) {
  const { label, value, onChange, min, max, step, description, errorMessage } = props;
  return (
    <NumberField
      value={Number.isFinite(value) ? value : undefined}
      onChange={onChange}
      minValue={min}
      maxValue={max}
      step={step}
      isInvalid={Boolean(errorMessage)}
      data-cy={props['data-cy']}
    >
      <Label>{label}</Label>
      <NumberFieldGroup>
        <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
        <NumberFieldInput />
        <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
      </NumberFieldGroup>
      {description && <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </NumberField>
  );
}
