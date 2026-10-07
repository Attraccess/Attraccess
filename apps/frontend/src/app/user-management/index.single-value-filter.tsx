import { Autocomplete, ListBox, SearchField, useFilter } from '@heroui/react';
import { SearchIcon } from 'lucide-react';
import { FilterOption } from './index.filter-option';
import { MobileValueFilter } from './index.mobile-value-filter';

export function SingleValueFilter({
  ariaLabel,
  options,
  selectedKey,
  onSelectionChange,
  dataCy,
  doneLabel,
}: {
  ariaLabel: string;
  options: FilterOption[];
  selectedKey?: string;
  onSelectionChange: (key?: string) => void;
  dataCy: string;
  doneLabel: string;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });

  return (
    <>
      <div className="hidden sm:block">
        <Autocomplete
          className="min-w-28"
          placeholder={ariaLabel}
          value={selectedKey}
          onChange={(key) => onSelectionChange(key ? String(key) : undefined)}
          aria-label={ariaLabel}
          data-cy={dataCy}
        >
          <Autocomplete.Trigger>
            <Autocomplete.Value>
              {() => options.find((option) => option.key === selectedKey)?.label ?? ariaLabel}
            </Autocomplete.Value>
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover>
            <Autocomplete.Filter filter={contains}>
              <SearchField autoFocus aria-label={ariaLabel}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={ariaLabel} />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <ListBox aria-label={ariaLabel}>
                {options.map((option) => (
                  <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                    {option.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      </div>
      <MobileValueFilter
        ariaLabel={ariaLabel}
        options={options}
        selectedKeys={selectedKey ? [selectedKey] : []}
        onSelectionChange={(keys) => onSelectionChange(keys[0])}
        selectionMode="single"
        dataCy={dataCy}
        doneLabel={doneLabel}
      />
    </>
  );
}
