// Simple single-selection wrapper over HeroUI v3 Select compound component
// FEATURE: Select utility wrapping v3 compound for consistent single-select API
import {
  Select as HeroUiSelect,
  SelectTrigger,
  SelectValue,
  SelectIndicator,
  SelectPopover,
  ListBox,
  ListBoxItem,
  Label,
  Description,
} from '@heroui/react';
import { ReactNode } from 'react';

interface SelectItem {
  key: string;
  label: ReactNode;
  textValue?: string;
}

export interface Props {
  value?: string;
  defaultValue?: string;
  onChange?: (key: string) => unknown;
  items: SelectItem[];
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  name?: string;
  disabledKeys?: Iterable<string | number>;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  'aria-label'?: string;
  'data-cy'?: string;
  isLoading?: boolean;
}

export function Select({
  value,
  defaultValue,
  onChange,
  items,
  label,
  description,
  placeholder,
  className,
  isDisabled,
  isRequired,
  isInvalid,
  name,
  disabledKeys,
  variant,
  fullWidth,
  'aria-label': ariaLabel,
  'data-cy': dataCy,
}: Props) {
  return (
    <HeroUiSelect<SelectItem>
      value={value}
      defaultValue={defaultValue}
      onChange={(key) => onChange?.(key as string)}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={isInvalid}
      name={name}
      disabledKeys={disabledKeys}
      variant={variant}
      fullWidth={fullWidth}
      className={className}
      aria-label={ariaLabel}
      data-cy={dataCy}
    >
      {label && <Label>{label}</Label>}
      {description && <Description>{description}</Description>}
      <SelectTrigger>
        <SelectValue />
        <SelectIndicator />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {items.map((item) => (
            <ListBoxItem
              key={item.key}
              id={item.key}
              textValue={item.textValue ?? (typeof item.label === 'string' ? item.label : item.key)}
              data-cy={`select-item-${item.key}`}
            >
              {item.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </HeroUiSelect>
  );
}
