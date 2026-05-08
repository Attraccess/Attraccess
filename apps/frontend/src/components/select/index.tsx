import { Select as HeroUiSelect, SelectProps as HeroUiSelectProps, SharedSelection } from "@heroui/react";
import { SelectItem as HeroUiSelectItem } from "../../utils/heroui-compat";
import { ReactNode, useCallback, useEffect, useState } from 'react';

interface SelectItem {
  key: string;
  label: ReactNode;
}

export type Props = Omit<
  HeroUiSelectProps,
  'items' | 'selectedKeys' | 'onChange' | 'children' | 'onSelectionChange'
> & {
  selectedKey: string;
  onSelectionChange: (key: string) => unknown;
  items: SelectItem[];
};

export function Select(props: Props) {
  const { selectedKey, onSelectionChange, items, ...selectProps } = props;

  const selectionToSet = useCallback((selection: Props['selectedKey']) => {
    return new Set(selection ? [selection] : []);
  }, []);

  const [value, setValue] = useState(selectionToSet(selectedKey));

  useEffect(() => {
    setValue(selectionToSet(selectedKey));
  }, [selectedKey, selectionToSet]);

  const handleSelectionChange = useCallback(
    (keys: SharedSelection) => {
      if (keys === 'all') {
        return;
      }

      setValue(keys as Set<string>);
      const selected = keys.values().next().value as string | undefined;
      onSelectionChange(selected ?? '');
    },
    [onSelectionChange],
  );

  return (
    <HeroUiSelect
      {...selectProps}
      items={items}
      selectedKeys={value}
      onSelectionChange={handleSelectionChange}
    >
      {items.map((item) => (
        <HeroUiSelectItem key={item.key} data-cy={`select-item-${item.key}`}>
          {item.label}
        </HeroUiSelectItem>
      ))}
    </HeroUiSelect>
  );
}
