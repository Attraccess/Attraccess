import { useState } from 'react';
import { Button } from '@heroui/react';
import { ListBox } from '@heroui/react';
import { SearchField } from '@heroui/react';
import { DrawerBody } from '@heroui/react';
import { DrawerFooter } from '@heroui/react';
import { DrawerHeader } from '@heroui/react';
import { useOverlayState } from '@heroui/react';

import { StandardDrawer } from '../../components/standardDrawer';
import type { FilterOption } from './index.contracts';
import { Autocomplete } from '@heroui/react';
import { useFilter } from '@heroui/react';

export function MobileValueFilter({
  ariaLabel,
  options,
  selectedKeys,
  onSelectionChange,
  selectionMode,
  dataCy,
  doneLabel,
  selectedCountLabel,
}: {
  ariaLabel: string;
  options: FilterOption[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  selectionMode: 'single' | 'multiple';
  dataCy: string;
  doneLabel: string;
  selectedCountLabel?: (count: number) => string;
}) {
  const { isOpen, open, setOpen } = useOverlayState();
  const [query, setQuery] = useState('');
  const filteredOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const selectedOptions = options.filter((option) => selectedKeys.includes(option.key));
  const label = selectedOptions.length
    ? selectionMode === 'multiple'
      ? (selectedCountLabel?.(selectedOptions.length) ?? ariaLabel)
      : selectedOptions[0].label
    : ariaLabel;

  return (
    <>
      <Button
        className="w-full justify-between sm:hidden"
        variant="ghost"
        onPress={open}
        data-cy={`${dataCy}-drawer-trigger`}
      >
        {label}
      </Button>
      <StandardDrawer isOpen={isOpen} onOpenChange={setOpen} contentProps={{ placement: 'bottom' }}>
        <DrawerHeader>{ariaLabel}</DrawerHeader>
        <DrawerBody className="flex flex-col gap-3">
          <SearchField value={query} onChange={setQuery} autoFocus aria-label={ariaLabel}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={ariaLabel} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            aria-label={ariaLabel}
            selectionMode={selectionMode}
            selectedKeys={selectedKeys}
            onSelectionChange={(keys) => {
              const nextKeys = [...keys].map(String);
              onSelectionChange(nextKeys);
              if (selectionMode !== 'multiple') setOpen(false);
            }}
          >
            {filteredOptions.map((option) => (
              <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </DrawerBody>
        {selectionMode === 'multiple' ? (
          <DrawerFooter>
            <Button className="w-full" variant="primary" onPress={() => setOpen(false)}>
              {doneLabel}
            </Button>
          </DrawerFooter>
        ) : null}
      </StandardDrawer>
    </>
  );
}

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
