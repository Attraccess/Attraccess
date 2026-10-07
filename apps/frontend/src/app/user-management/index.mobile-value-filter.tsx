import { useState } from 'react';
import {
  Button,
  ListBox,
  SearchField,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  useOverlayState,
} from '@heroui/react';
import { SearchIcon } from 'lucide-react';
import { StandardDrawer } from '../../components/standardDrawer';
import { FilterOption } from './index.filter-option';

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
        <DrawerHeader>
          <DrawerHeading>{ariaLabel}</DrawerHeading>
        </DrawerHeader>
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
