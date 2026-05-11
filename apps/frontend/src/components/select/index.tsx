// Simple single-selection wrapper over HeroUI v3 Select compound component
// FEATURE: Select utility wrapping v3 compound for consistent single-select API
import { Select as HeroUiSelect, SelectTrigger, SelectValue, SelectIndicator, SelectPopover, ListBox, ListBoxItem, Label } from "@heroui/react";
import { ReactNode } from 'react';

interface SelectItem {
  key: string;
  label: ReactNode;
  textValue?: string;
}

export interface Props {
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string) => unknown;
  items: SelectItem[];
  label?: ReactNode;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  'aria-label'?: string;
  'data-cy'?: string;
  isLoading?: boolean;
}

export function Select({ selectedKey, defaultSelectedKey, onSelectionChange, items, label, placeholder, className, isDisabled, isRequired, 'aria-label': ariaLabel, 'data-cy': dataCy }: Props) {
  return (
    <HeroUiSelect<SelectItem>
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={(key) => onSelectionChange?.(key as string)}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isRequired={isRequired}
      className={className}
      aria-label={ariaLabel}
      data-cy={dataCy}
    >
      {label && <Label>{label}</Label>}
      <SelectTrigger>
        <SelectValue />
        <SelectIndicator />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {items.map((item) => (
            <ListBoxItem key={item.key} id={item.key} textValue={item.textValue ?? (typeof item.label === 'string' ? item.label : item.key)} data-cy={`select-item-${item.key}`}>
              {item.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </HeroUiSelect>
  );
}
