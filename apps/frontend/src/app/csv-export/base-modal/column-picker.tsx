// Column picker for CSV export modal — search, bulk select, multi-select list
// FEATURE: CSV export — modal left pane for choosing which columns to include
import { Button, Checkbox, InputGroup, Label, TextField } from '@heroui/react';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ColumnLite {
  key: string;
  label: string;
}

interface OptionLite {
  key: string;
  label: string;
  value: boolean;
}

interface Props {
  columns: ColumnLite[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  options?: OptionLite[];
  onOptionChange?: (key: string, next: boolean) => void;
  searchLabel: string;
  searchPlaceholder: string;
  selectAllLabel: string;
  selectNoneLabel: string;
  selectedCountLabel: (vars: { selected: number; total: number }) => string;
}

export function ColumnPicker(props: Props) {
  const {
    columns,
    selectedKeys,
    onSelectionChange,
    options,
    onOptionChange,
    searchLabel,
    searchPlaceholder,
    selectAllLabel,
    selectNoneLabel,
    selectedCountLabel,
  } = props;

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((col) => col.label.toLowerCase().includes(q));
  }, [columns, search]);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <TextField value={search} onChange={setSearch} className="w-full" data-cy="csv-export-column-search">
        <Label className="text-sm font-medium">{searchLabel}</Label>
        <InputGroup>
          <InputGroup.Prefix>
            <SearchIcon size={16} />
          </InputGroup.Prefix>
          <InputGroup.Input placeholder={searchPlaceholder} />
        </InputGroup>
      </TextField>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onPress={() => onSelectionChange(columns.map((c) => c.key))}
            data-cy="csv-export-select-all"
          >
            {selectAllLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onPress={() => onSelectionChange([])}
            data-cy="csv-export-select-none"
          >
            {selectNoneLabel}
          </Button>
        </div>
        <span className="text-xs text-muted">
          {selectedCountLabel({ selected: selectedKeys.length, total: columns.length })}
        </span>
      </div>

      <div className="flex flex-col gap-2" data-cy="resource-usage-export-columns-listbox">
        {filtered.map((column) => {
          const isChecked = selectedKeys.includes(column.key);
          return (
            <Checkbox
              key={column.key}
              isSelected={isChecked}
              onChange={(next) => {
                if (next) onSelectionChange([...selectedKeys, column.key]);
                else onSelectionChange(selectedKeys.filter((k) => k !== column.key));
              }}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>{column.label}</Checkbox.Content>
            </Checkbox>
          );
        })}
      </div>

      {(options ?? []).length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          {(options ?? []).map((option) => (
            <Checkbox
              key={option.key}
              isSelected={option.value}
              onChange={(nextValue) => onOptionChange?.(option.key, nextValue)}
              data-cy="resource-usage-export-grouping-checkbox"
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>{option.label}</Checkbox.Content>
            </Checkbox>
          ))}
        </div>
      )}
    </div>
  );
}
