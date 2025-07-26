import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { ReactNode, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectItem {
  key: string;
  label: ReactNode;
}

interface SelectProps {
  label?: string;
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  items: SelectItem[];
  id?: string;
  name?: string;
  isLoading?: boolean;
}

export function Select(props: SelectProps) {
  const { selectedKey, onSelectionChange, items, label, id, name, isLoading } = props;

  const selectedItem = useMemo(() => {
    return items.find((item) => item.key === selectedKey);
  }, [items, selectedKey]);

  return (
    <div className="flex flex-col items-start gap-2">
      <label className="text-gray-500 text-xs">{label}</label>
      <input type="hidden" id={id} name={name} value={selectedKey} />
      <Dropdown>
        <DropdownTrigger>
          <Button endContent={<ChevronDown size={16} />} data-cy="select-trigger-button" isLoading={isLoading}>
            <span>{selectedItem?.label}</span>
          </Button>
        </DropdownTrigger>
        <DropdownMenu aria-label="Static Actions">
          {items.map((item) => (
            <DropdownItem key={item.key} onPress={() => onSelectionChange(item.key)}>
              {item.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    </div>
  );
}
