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
  FieldError,
} from '@heroui/react';
import { ComponentProps, ReactNode } from 'react';

interface SelectItem {
  key: string;
  label: ReactNode;
  textValue?: string;
  /** A hint shown under the item's label in the list. */
  description?: ReactNode;
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
  /** Shown below the trigger and announced with the field while `isInvalid` is set. */
  errorMessage?: ReactNode;
  /** Extra classes for the rendered value, e.g. `min-w-0 wrap-anywhere` for long unbreakable values. */
  valueClassName?: string;
  name?: string;
  disabledKeys?: Iterable<string | number>;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  popoverProps?: Pick<ComponentProps<typeof SelectPopover>, 'placement' | 'offset'>;
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
  errorMessage,
  valueClassName,
  name,
  disabledKeys,
  variant,
  fullWidth,
  popoverProps,
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
        <SelectValue className={valueClassName} />
        <SelectIndicator />
      </SelectTrigger>
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
      <SelectPopover {...popoverProps}>
        <ListBox>
          {items.map((item) => (
            <ListBoxItem
              key={item.key}
              id={item.key}
              textValue={item.textValue ?? (typeof item.label === 'string' ? item.label : item.key)}
              data-cy={`select-item-${item.key}`}
            >
              {item.description ? (
                <div className="flex flex-col">
                  <Label>{item.label}</Label>
                  <Description>{item.description}</Description>
                </div>
              ) : (
                item.label
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </HeroUiSelect>
  );
}
