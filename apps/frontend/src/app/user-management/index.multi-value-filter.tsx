import { Autocomplete, ListBox, SearchField, useFilter } from '@heroui/react';
import { SearchIcon } from 'lucide-react';
import { FilterOption } from './index.filter-option';
import { MobileValueFilter } from './index.mobile-value-filter';

export function MultiValueFilter({
  ariaLabel,
  selectedCountLabel,
  options,
  selectedKeys,
  onSelectionChange,
  dataCy,
  doneLabel,
}: {
  ariaLabel: string;
  selectedCountLabel: (count: number) => string;
  options: FilterOption[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  dataCy: string;
  doneLabel: string;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const selectedOptions = options.filter((option) => selectedKeys.includes(option.key));

  return (
    <>
      <div className="hidden sm:block">
        <Autocomplete
          className="min-w-0"
          placeholder={ariaLabel}
          selectionMode="multiple"
          value={selectedKeys}
          onChange={(keys) => onSelectionChange([...keys].map(String))}
          aria-label={
            selectedOptions.length
              ? `${ariaLabel}: ${selectedOptions.map((option) => option.label).join(', ')}`
              : ariaLabel
          }
          data-cy={dataCy}
        >
          <Autocomplete.Trigger>
            <Autocomplete.Value>
              {() => (selectedOptions.length ? selectedCountLabel(selectedOptions.length) : ariaLabel)}
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
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        selectionMode="multiple"
        dataCy={dataCy}
        doneLabel={doneLabel}
        selectedCountLabel={selectedCountLabel}
      />
    </>
  );
}
