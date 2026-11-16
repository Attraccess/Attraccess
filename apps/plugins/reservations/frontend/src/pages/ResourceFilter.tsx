import { useDebounce } from '@attraccess/plugins-frontend-ui';
import { Autocomplete, Label, ListBox, SearchField } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { searchHostResources } from '../api';
import { useReservationsTranslations } from '../i18n';
import type { NamedEntity } from '../lib/types';

const ALL = 'all';

interface Props {
  value: NamedEntity | null;
  /** Null means every resource. */
  onChange: (resource: NamedEntity | null) => void;
}

/**
 * Single-resource filter of the manage page. The host searches its resources as the user types, so
 * every resource is reachable, not just the first page; the chosen one stays shown when a later
 * search no longer lists it.
 */
export function ResourceFilter({ value, onChange }: Readonly<Props>) {
  const { t } = useReservationsTranslations();
  const [search, setSearch] = useState('');
  const term = useDebounce(search.trim(), 250);
  const results = useQuery({
    queryKey: ['reservations', 'host-resources', term],
    queryFn: () => searchHostResources(term),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const label = t('manage.filters.resource');
  const allLabel = t('manage.filters.allResources');

  return (
    <Autocomplete
      value={value ? String(value.id) : ALL}
      onChange={(key) => {
        const id = Number(key);
        const resource = (results.data ?? []).find((entry) => entry.id === id);
        onChange(resource ?? null);
      }}
      fullWidth
      data-cy="reservations-manage-resource"
    >
      <Label>{label}</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value>{() => value?.name ?? allLabel}</Autocomplete.Value>
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter inputValue={search} onInputChange={setSearch}>
          <SearchField autoFocus aria-label={t('manage.filters.searchResources')}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={t('manage.filters.searchResources')} />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox aria-label={label}>
            <ListBox.Item id={ALL} textValue={allLabel}>
              {allLabel}
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {(results.data ?? []).map((resource) => (
              <ListBox.Item key={resource.id} id={String(resource.id)} textValue={resource.name}>
                {resource.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
