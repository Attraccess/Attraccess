// Small HeroUI form building block shared by the settings, feed and filter forms.
import {
  Description,
  Label,
  ListBox,
  ListBoxItem,
  Select as HeroSelect,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
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
