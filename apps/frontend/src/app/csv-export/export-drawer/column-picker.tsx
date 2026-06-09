// Column picker for CSV export drawer — search, bulk select, checkbox group
// FEATURE: CSV export — choose which columns to include in the export
import { Button, ButtonGroup, Checkbox, CheckboxGroup, Label, SearchField } from '@heroui/react';
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
    <section className="flex min-w-0 flex-col gap-3">
      <SearchField value={search} onChange={setSearch} fullWidth data-cy="csv-export-column-search">
        <Label className="text-sm font-medium">{searchLabel}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={searchPlaceholder} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <div className="flex items-center justify-between gap-2">
        <ButtonGroup size="sm" variant="outline">
          <Button onPress={() => onSelectionChange(columns.map((c) => c.key))} data-cy="csv-export-select-all">
            {selectAllLabel}
          </Button>
          <Button onPress={() => onSelectionChange([])} data-cy="csv-export-select-none">
            {selectNoneLabel}
          </Button>
        </ButtonGroup>
        <span className="text-xs text-muted">
          {selectedCountLabel({ selected: selectedKeys.length, total: columns.length })}
        </span>
      </div>

      <CheckboxGroup
        aria-label={searchLabel}
        value={selectedKeys}
        onChange={onSelectionChange}
        className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2"
        data-cy="resource-usage-export-columns-listbox"
      >
        {filtered.map((column) => (
          <Checkbox key={column.key} value={column.key}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>{column.label}</Checkbox.Content>
          </Checkbox>
        ))}
      </CheckboxGroup>

      {(options ?? []).length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
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
    </section>
  );
}
