// Small HeroUI form building blocks shared by the settings, feed and filter forms.
import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Select as HeroSelect,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  TextField,
} from '@heroui/react';
import type { ReactNode } from 'react';

export interface Option {
  key: string;
  label: string;
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (key: string) => void;
  options: Option[];
  description?: ReactNode;
  isDisabled?: boolean;
  isInvalid?: boolean;
  className?: string;
  'data-cy'?: string;
}) {
  const { label, value, onChange, options, description, isDisabled, isInvalid, className } = props;
  return (
    <HeroSelect
      value={value}
      onChange={(key) => onChange(String(key))}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      className={className}
      placeholder={label}
      data-cy={props['data-cy']}
    >
      <Label>{label}</Label>
      <SelectTrigger>
        <SelectValue />
        <SelectIndicator />
      </SelectTrigger>
      {description && <Description>{description}</Description>}
      <SelectPopover>
        <ListBox>
          {options.map((option) => (
            <ListBoxItem key={option.key} id={option.key} textValue={option.label}>
              {option.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </HeroSelect>
  );
}

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

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  isRequired?: boolean;
  description?: ReactNode;
  'data-cy'?: string;
}) {
  const { label, value, onChange, type, placeholder, maxLength, isRequired, description } = props;
  return (
    <TextField value={value} onChange={onChange} isRequired={isRequired} type={type}>
      <Label>{label}</Label>
      <Input placeholder={placeholder} maxLength={maxLength} data-cy={props['data-cy']} autoComplete="off" />
      {description && <Description>{description}</Description>}
    </TextField>
  );
}
