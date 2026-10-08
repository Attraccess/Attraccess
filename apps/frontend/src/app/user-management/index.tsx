import { PageHeader, PageAction } from '../../components/pageHeader/index';
import {
  Button,
  TextField,
  InputGroup,
  CloseButton,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Autocomplete,
  ListBox,
  SearchField,
  useFilter,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  useOverlayState,
} from '@heroui/react';
import { SearchIcon, UserPlusIcon, Users, PlusIcon } from 'lucide-react';
import { TableToolbar } from '../../components/TableToolbar/index';
import { InviteUserModal } from './invite-user-modal/index';
import { SimplePagination } from '../../components/simplePagination/index';
import { useUserManagementPageState, FilterKey, MultiValueCondition, FILTER_KEYS, Props } from './filters/types';
import { UserTable } from './components/UserTable';
import { Select } from '../../components/select/index';
import { useState } from 'react';
import { StandardDrawer } from '../../components/standardDrawer';

export type FilterOption = {
  key: string;
  label: string;
};

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

export function UserManagementPageFiltersLabel({
  t,
  activeFilters,
  replaceFilter,
  roleExcludes,
  roleMatch,
  setRoleCondition,
  roles,
  roleName,
  excludeRoleIds,
  roleIds,
  updateFilters,
  emailVerified,
  ssoProviderExcludes,
  ssoProviderMatch,
  setSsoProviderCondition,
  ssoProviders,
  ssoProviderNone,
  hasSsoProvider,
  excludeSsoProviderIds,
  ssoProviderIds,
  removeFilter,
  addFilter,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('filters.label')}>
      {activeFilters.map((filter) => (
        <div
          key={filter}
          role="group"
          aria-label={t(`filters.${filter}`)}
          className="grid max-w-full grid-cols-[max-content_minmax(0,1fr)_2.25rem] overflow-hidden rounded-medium border border-default-200 bg-content1 text-sm shadow-xs sm:flex sm:w-auto"
        >
          <Select
            className="min-w-fit whitespace-nowrap"
            aria-label={t('filters.category')}
            value={filter}
            onChange={(value) => replaceFilter(filter, value as FilterKey)}
            items={FILTER_KEYS.filter((key) => key === filter || !activeFilters.includes(key)).map((key) => ({
              key,
              label: t(`filters.${key}`),
            }))}
          />
          {filter === 'role' ? (
            <>
              <Select
                className="min-w-fit border-l border-default-200 whitespace-nowrap"
                aria-label={t('filters.roleMatch')}
                value={roleExcludes ? 'none' : roleMatch}
                onChange={(value) => setRoleCondition(value as MultiValueCondition)}
                items={[
                  { key: 'any', label: t('filters.isAnyOf') },
                  { key: 'all', label: t('filters.isAllOf') },
                  { key: 'none', label: t('filters.isNoneOf') },
                ]}
              />
              <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                <MultiValueFilter
                  ariaLabel={t('filters.roleValues')}
                  selectedCountLabel={(count) => t('filters.selectedCount', { count })}
                  options={(roles ?? []).map((role) => ({ key: String(role.id), label: roleName(role) }))}
                  selectedKeys={(roleExcludes ? excludeRoleIds : roleIds).map(String)}
                  onSelectionChange={(keys) =>
                    updateFilters((params) => {
                      const param = roleExcludes ? 'excludeRoleId' : 'roleId';
                      params.delete(param);
                      keys.forEach((key) => params.append(param, key));
                      if (keys.length === 0) params.delete('roleMatch');
                    })
                  }
                  dataCy="user-management-role-filter"
                  doneLabel={t('filters.done')}
                />
              </div>
            </>
          ) : filter === 'emailVerified' ? (
            <>
              <span className="border-l border-default-200 px-3 py-1.5 text-default-500">{t('filters.is')}</span>
              <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                <SingleValueFilter
                  ariaLabel={t('filters.emailVerificationStatus')}
                  options={[
                    { key: 'true', label: t('filters.verified') },
                    { key: 'false', label: t('filters.notVerified') },
                  ]}
                  selectedKey={emailVerified === 'true' || emailVerified === 'false' ? emailVerified : undefined}
                  onSelectionChange={(key) =>
                    updateFilters((params) => (key ? params.set('emailVerified', key) : params.delete('emailVerified')))
                  }
                  dataCy="user-management-email-verified-filter"
                  doneLabel={t('filters.done')}
                />
              </div>
            </>
          ) : (
            <>
              <Select
                className="min-w-fit border-l border-default-200 whitespace-nowrap"
                aria-label={t('filters.ssoProviderMatch')}
                value={ssoProviderExcludes ? 'none' : ssoProviderMatch}
                onChange={(value) => setSsoProviderCondition(value as MultiValueCondition)}
                items={[
                  { key: 'any', label: t('filters.isAnyOf') },
                  { key: 'all', label: t('filters.isAllOf') },
                  { key: 'none', label: t('filters.isNoneOf') },
                ]}
              />
              <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                <MultiValueFilter
                  ariaLabel={t('filters.ssoProviderValues')}
                  selectedCountLabel={(count) => t('filters.selectedCount', { count })}
                  options={[
                    { key: 'none', label: t('filters.none') },
                    ...(ssoProviders ?? []).map((provider) => ({
                      key: String(provider.id),
                      label: provider.name,
                    })),
                  ]}
                  selectedKeys={[
                    ...(ssoProviderNone || hasSsoProvider ? ['none'] : []),
                    ...(ssoProviderExcludes ? excludeSsoProviderIds : ssoProviderIds).map(String),
                  ]}
                  onSelectionChange={(keys) =>
                    updateFilters((params) => {
                      const isExcluding = ssoProviderExcludes;
                      const param = isExcluding ? 'excludeSsoProviderId' : 'ssoProviderId';
                      params.delete(param);
                      params.delete('ssoProviderNone');
                      params.delete('hasSsoProvider');
                      if (keys.includes('none')) {
                        params.set(isExcluding ? 'hasSsoProvider' : 'ssoProviderNone', 'true');
                      }
                      keys.filter((key) => key !== 'none').forEach((key) => params.append(param, key));
                      if (keys.length === 0) params.delete('ssoProviderMatch');
                    })
                  }
                  dataCy="user-management-sso-provider-filter"
                  doneLabel={t('filters.done')}
                />
              </div>
            </>
          )}
          <CloseButton
            className="self-center justify-self-center"
            aria-label={t('filters.remove')}
            onPress={() => removeFilter(filter)}
          />
        </div>
      ))}
      {activeFilters.length < FILTER_KEYS.length ? (
        <Dropdown>
          <DropdownTrigger>
            <Button size="sm" variant="ghost" aria-label={t('filters.add')}>
              <PlusIcon size={14} />
              {activeFilters.length === 0 ? t('filters.add') : null}
            </Button>
          </DropdownTrigger>
          <DropdownPopover>
            <DropdownMenu aria-label={t('filters.add')}>
              {FILTER_KEYS.filter((filter) => !activeFilters.includes(filter)).map((filter) => (
                <DropdownItem key={filter} id={filter} onPress={() => addFilter(filter)}>
                  {t(`filters.${filter}`)}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </DropdownPopover>
        </Dropdown>
      ) : null}
    </div>
  );
}

// Role keys that are considered "default" and not worth showing in the list

export function UserManagementPage() {
  const {
    t,
    roleName,
    page,
    setPage,
    search,
    roleIds,
    excludeRoleIds,
    roleMatch,
    roleExcludes,
    emailVerified,
    ssoProviderIds,
    excludeSsoProviderIds,
    ssoProviderNone,
    hasSsoProvider,
    ssoProviderMatch,
    ssoProviderExcludes,
    assignRoleId,
    activeFilters,
    navigate,
    roles,
    searchResult,
    isFetchedSearchResult,
    updateFilters,
    addFilter,
    removeFilter,
    replaceFilter,
    setRoleCondition,
    setSsoProviderCondition,
    startRoleAssignment,
    totalPages,
    ssoProviders,
    providersById,
  } = useUserManagementPageState();

  return (
    <div data-cy="user-management-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        backTo="/"
        icon={<Users className="w-6 h-6" />}
        data-cy="user-management-page-header"
        actions={
          [
            {
              key: 'invite-user',
              label: t('actions.inviteUser'),
              icon: <UserPlusIcon className="w-4 h-4" />,
              variant: 'primary',
              renderTrigger: (triggerProps) => (
                <InviteUserModal>{(onOpen) => <Button {...triggerProps} onPress={onOpen} />}</InviteUserModal>
              ),
            },
          ] satisfies PageAction[]
        }
      />

      <div className="mt-6">
        <TableToolbar
          search={
            <div className="space-y-2">
              <TextField
                value={search}
                onChange={(value) => updateFilters((params) => (value ? params.set('q', value) : params.delete('q')))}
                aria-label={t('table.inputs.search')}
              >
                <InputGroup>
                  <InputGroup.Prefix>
                    <SearchIcon size={16} />
                  </InputGroup.Prefix>
                  <InputGroup.Input placeholder={t('table.inputs.search')} data-cy="user-management-search-input" />
                </InputGroup>
              </TextField>
              <UserManagementPageFiltersLabel
                {...{
                  t,
                  activeFilters,
                  replaceFilter,
                  roleExcludes,
                  roleMatch,
                  setRoleCondition,
                  roles,
                  roleName,
                  excludeRoleIds,
                  roleIds,
                  updateFilters,
                  emailVerified,
                  ssoProviderExcludes,
                  ssoProviderMatch,
                  setSsoProviderCondition,
                  ssoProviders,
                  ssoProviderNone,
                  hasSsoProvider,
                  excludeSsoProviderIds,
                  ssoProviderIds,
                  removeFilter,
                  addFilter,
                }}
              />
            </div>
          }
        />

        <UserTable {...{ t, searchResult, roleIds, roles, providersById, navigate, assignRoleId, roleName }} />

        {roleIds.length === 1 && isFetchedSearchResult && searchResult?.total === 0 ? (
          <div className="flex justify-center mt-3">
            <Button size="sm" variant="primary" onPress={startRoleAssignment}>
              {t('empty.assignRole')}
            </Button>
          </div>
        ) : null}

        <div className="flex w-full justify-end mt-4">
          {isFetchedSearchResult && (
            <SimplePagination showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
          )}
        </div>
      </div>
    </div>
  );
}
