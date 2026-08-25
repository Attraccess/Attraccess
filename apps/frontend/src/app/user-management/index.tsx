import React, { useMemo, useState } from 'react';
import { PageHeader, PageAction } from '../../components/pageHeader';
import { AttraccessUser, useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Chip,
  CloseButton,
  Autocomplete,
  TextField,
  InputGroup,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  ListBox,
  SearchField,
  useFilter,
} from '@heroui/react';
import { KeyIcon, PlusIcon, SearchIcon, ShieldCheckIcon, ShieldOffIcon, UserPlusIcon, Users } from 'lucide-react';
import { TableToolbar } from '../../components/TableToolbar';
import {
  SSOProvider,
  User,
  UserRole,
  PaginatedUsersResponseDto,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
  useUsersServiceFindMany,
  useRbacServiceListRoles,
} from '@attraccess/react-query-client';
import { EmptyState } from '../../components/emptyState';

import en from './en.json';
import de from './de.json';
import { InviteUserModal } from './invite-user-modal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SimplePagination } from '../../components/simplePagination';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import { Select } from '../../components/select';

// Role keys that are considered "default" and not worth showing in the list
const DEFAULT_ROLE_KEYS = new Set(['user']);

type FilterOption = {
  key: string;
  label: string;
};

type FilterKey = 'role' | 'emailVerified' | 'ssoProvider';
type MultiValueCondition = 'any' | 'all' | 'none';

const FILTER_KEYS: FilterKey[] = ['role', 'emailVerified', 'ssoProvider'];

function MultiValueFilter({
  ariaLabel,
  selectedCountLabel,
  options,
  selectedKeys,
  onSelectionChange,
  dataCy,
}: {
  ariaLabel: string;
  selectedCountLabel: (count: number) => string;
  options: FilterOption[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  dataCy: string;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const selectedOptions = options.filter((option) => selectedKeys.includes(option.key));

  return (
    <Autocomplete
      className="min-w-0"
      placeholder={ariaLabel}
      selectionMode="multiple"
      value={selectedKeys}
      onChange={(keys) => onSelectionChange([...keys].map(String))}
      aria-label={
        selectedOptions.length ? `${ariaLabel}: ${selectedOptions.map((option) => option.label).join(', ')}` : ariaLabel
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
  );
}

function SingleValueFilter({
  ariaLabel,
  options,
  selectedKey,
  onSelectionChange,
  dataCy,
}: {
  ariaLabel: string;
  options: FilterOption[];
  selectedKey?: string;
  onSelectionChange: (key?: string) => void;
  dataCy: string;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });

  return (
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
  );
}

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslations({ en, de });
  const { roleName } = useRbacCatalogTranslations();

  const [limit] = useState(10);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const roleIds = searchParams.getAll('roleId').map(Number).filter(Number.isInteger);
  const excludeRoleIds = searchParams.getAll('excludeRoleId').map(Number).filter(Number.isInteger);
  const roleMatch = searchParams.get('roleMatch') === 'all' ? 'all' : 'any';
  const roleExcludes = searchParams.get('roleOperator') === 'none';
  const emailVerified = searchParams.get('emailVerified');
  const ssoProviderIds = searchParams.getAll('ssoProviderId').map(Number).filter(Number.isInteger);
  const excludeSsoProviderIds = searchParams.getAll('excludeSsoProviderId').map(Number).filter(Number.isInteger);
  const ssoProviderNone = searchParams.get('ssoProviderNone') === 'true';
  const hasSsoProvider = searchParams.get('hasSsoProvider') === 'true';
  const ssoProviderMatch = searchParams.get('ssoProviderMatch') === 'all' ? 'all' : 'any';
  const ssoProviderExcludes = searchParams.get('ssoProviderOperator') === 'none';
  const assignRoleId = Number(searchParams.get('assignRoleId')) || undefined;
  const activeFilters = FILTER_KEYS.filter(
    (filter) =>
      searchParams.getAll('filter').includes(filter) ||
      (filter === 'role' && (roleIds.length > 0 || excludeRoleIds.length > 0)) ||
      (filter === 'emailVerified' && emailVerified !== null) ||
      (filter === 'ssoProvider' &&
        (ssoProviderIds.length > 0 || excludeSsoProviderIds.length > 0 || ssoProviderNone || hasSsoProvider)),
  );

  const debouncedSearch = useDebounce(search, 500);

  const navigate = useNavigate();
  const { data: roles } = useRbacServiceListRoles();

  const { data: searchResult, isFetched: isFetchedSearchResult } = useUsersServiceFindMany<PaginatedUsersResponseDto>({
    limit,
    page,
    search: debouncedSearch,
    roleIds,
    excludeRoleIds,
    roleMatch,
    emailVerified: emailVerified === null ? undefined : emailVerified === 'true',
    ssoProviderIds,
    excludeSsoProviderIds,
    ssoProviderNone: ssoProviderNone || undefined,
    hasSsoProvider: hasSsoProvider || undefined,
    ssoProviderMatch,
    includeRoles: true,
  });

  const updateFilters = (update: (params: URLSearchParams) => void) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      update(next);
      return next;
    });
    setPage(1);
  };

  const addFilter = (filter: FilterKey) => updateFilters((params) => params.append('filter', filter));

  const removeFilter = (filter: FilterKey) =>
    updateFilters((params) => {
      params.delete('filter');
      activeFilters.filter((key) => key !== filter).forEach((key) => params.append('filter', key));
      if (filter === 'role') {
        params.delete('roleId');
        params.delete('excludeRoleId');
        params.delete('roleMatch');
        params.delete('roleOperator');
      }
      if (filter === 'emailVerified') params.delete('emailVerified');
      if (filter === 'ssoProvider') {
        params.delete('ssoProviderId');
        params.delete('excludeSsoProviderId');
        params.delete('ssoProviderNone');
        params.delete('hasSsoProvider');
        params.delete('ssoProviderMatch');
        params.delete('ssoProviderOperator');
      }
    });

  const replaceFilter = (current: FilterKey, next: FilterKey) => {
    if (current === next || activeFilters.includes(next)) return;
    updateFilters((params) => {
      params.delete('filter');
      activeFilters.map((key) => (key === current ? next : key)).forEach((key) => params.append('filter', key));
      if (current === 'role') {
        params.delete('roleId');
        params.delete('excludeRoleId');
        params.delete('roleMatch');
        params.delete('roleOperator');
      }
      if (current === 'emailVerified') params.delete('emailVerified');
      if (current === 'ssoProvider') {
        params.delete('ssoProviderId');
        params.delete('excludeSsoProviderId');
        params.delete('ssoProviderNone');
        params.delete('hasSsoProvider');
        params.delete('ssoProviderMatch');
        params.delete('ssoProviderOperator');
      }
    });
  };

  const setRoleCondition = (condition: MultiValueCondition) =>
    updateFilters((params) => {
      const selectedIds = roleExcludes ? excludeRoleIds : roleIds;
      params.delete('roleId');
      params.delete('excludeRoleId');
      if (condition === 'none') {
        selectedIds.forEach((id) => params.append('excludeRoleId', String(id)));
        params.delete('roleMatch');
        params.set('roleOperator', 'none');
      } else {
        selectedIds.forEach((id) => params.append('roleId', String(id)));
        params.set('roleMatch', condition);
        params.delete('roleOperator');
      }
    });

  const setSsoProviderCondition = (condition: MultiValueCondition) =>
    updateFilters((params) => {
      const selectedIds = ssoProviderExcludes ? excludeSsoProviderIds : ssoProviderIds;
      params.delete('ssoProviderId');
      params.delete('excludeSsoProviderId');
      params.delete('ssoProviderNone');
      params.delete('hasSsoProvider');
      if (condition === 'none') {
        if (ssoProviderNone) {
          params.set('hasSsoProvider', 'true');
        } else {
          selectedIds.forEach((id) => params.append('excludeSsoProviderId', String(id)));
        }
        params.delete('ssoProviderMatch');
        params.set('ssoProviderOperator', 'none');
      } else {
        selectedIds.forEach((id) => params.append('ssoProviderId', String(id)));
        if (hasSsoProvider) params.set('ssoProviderNone', 'true');
        params.set('ssoProviderMatch', condition);
        params.delete('ssoProviderOperator');
      }
    });

  const startRoleAssignment = () => {
    setSearchParams({
      assignRoleId: String(roleIds[0]),
    });
    setPage(1);
  };

  const totalPages = useMemo(() => {
    if (!searchResult?.total) {
      return 1;
    }
    return Math.ceil(searchResult.total / limit);
  }, [searchResult?.total, limit]);

  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });

  const providersById = useMemo(
    () => new Map((ssoProviders ?? []).map((provider: SSOProvider) => [provider.id, provider])),
    [ssoProviders],
  );

  type AuthenticationDetailSummary = {
    providerId?: number | null;
    providerType?: string | null;
    ssoSubject?: string | null;
    type?: string | null;
  };

  type UserWithAuthDetails = Omit<User, 'authenticationDetails'> & {
    authenticationDetails?: AuthenticationDetailSummary[];
  };
  // includeRoles is restricted to users.read and the API returns full user records in that case.
  const users = (searchResult?.data ?? []) as User[];

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
                          />
                        </div>
                      </>
                    ) : filter === 'emailVerified' ? (
                      <>
                        <span className="border-l border-default-200 px-3 py-1.5 text-default-500">
                          {t('filters.is')}
                        </span>
                        <div className="col-span-2 min-w-0 border-t border-default-200 sm:col-span-1 sm:border-l sm:border-t-0">
                          <SingleValueFilter
                            ariaLabel={t('filters.emailVerificationStatus')}
                            options={[
                              { key: 'true', label: t('filters.verified') },
                              { key: 'false', label: t('filters.notVerified') },
                            ]}
                            selectedKey={
                              emailVerified === 'true' || emailVerified === 'false' ? emailVerified : undefined
                            }
                            onSelectionChange={(key) =>
                              updateFilters((params) =>
                                key ? params.set('emailVerified', key) : params.delete('emailVerified'),
                              )
                            }
                            dataCy="user-management-email-verified-filter"
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
            </div>
          }
        />

        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('table.ariaLabel')}>
              <TableHeader>
                <TableColumn width="0" className="hidden md:table-cell">
                  {t('table.columns.isEmailVerified')}
                </TableColumn>
                <TableColumn width="0">{t('table.columns.id')}</TableColumn>
                <TableColumn isRowHeader>{t('table.columns.username')}</TableColumn>
                <TableColumn className="hidden md:table-cell">{t('table.columns.externalIdentifier')}</TableColumn>
                <TableColumn className="hidden lg:table-cell">{t('table.columns.roles')}</TableColumn>
                <TableColumn width="0" className="text-center">
                  {t('table.columns.ssoLinked')}
                </TableColumn>
              </TableHeader>

              <TableBody
                items={(searchResult?.data ?? []) as User[]}
                renderEmptyState={() =>
                  roleIds.length ? (
                    <EmptyState
                      message={t('empty.role', {
                        role: roles?.find((role) => role.id === roleIds[0])?.name ?? roleIds[0],
                      })}
                    />
                  ) : (
                    <EmptyState />
                  )
                }
              >
                {(user) => {
                  const ssoDetails =
                    (user as UserWithAuthDetails).authenticationDetails?.filter(
                      (detail) => detail.ssoSubject || detail.providerId || detail.providerType,
                    ) ?? [];
                  const ssoProviderNames = ssoDetails
                    .map((detail) => {
                      if (detail.providerId) {
                        const provider = providersById.get(detail.providerId);
                        if (provider?.name) {
                          return provider.name;
                        }
                      }
                      if (detail.providerType && detail.providerId) {
                        return `${detail.providerType} #${detail.providerId}`;
                      }
                      return detail.providerType ?? '';
                    })
                    .filter((value) => value.length > 0)
                    .join(', ');
                  const isSsoLinked = ssoDetails.length > 0;
                  // This view only receives the detailed response because it requires users.read.
                  const detailedUser = user as User;

                  // Elevated roles (non-default) for display
                  const elevatedRoles = ((detailedUser.userRoles ?? []) as UserRole[])
                    .filter((ur) => ur.role && !DEFAULT_ROLE_KEYS.has(ur.role.key))
                    .reduce<{ id: number; name: string; key: string }[]>((acc, ur) => {
                      if (ur.role && !acc.some((r) => r.id === ur.role?.id)) {
                        acc.push({ id: ur.role.id, name: ur.role.name, key: ur.role.key });
                      }
                      return acc;
                    }, []);

                  return (
                    <TableRow
                      key={user.id}
                      id={user.id}
                      className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                      onAction={() =>
                        navigate(assignRoleId ? `/users/${user.id}?assignRoleId=${assignRoleId}` : `/users/${user.id}`)
                      }
                    >
                      <TableCell className="hidden md:table-cell">
                        {detailedUser.isEmailVerified ? <ShieldCheckIcon /> : <ShieldOffIcon />}
                      </TableCell>
                      <TableCell>{user.id}</TableCell>
                      <TableCell>
                        <AttraccessUser user={detailedUser} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{detailedUser.externalIdentifier}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {elevatedRoles.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {elevatedRoles.map((role) => (
                              <Chip
                                key={role.id}
                                size="sm"
                                color="accent"
                                variant="secondary"
                                data-cy={`user-role-chip-${role.key}`}
                              >
                                {roleName(role)}
                              </Chip>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-default-400">{t('table.noRoles')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isSsoLinked ? (
                          <Tooltip>
                            <TooltipTrigger tabIndex={0}>
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700">
                                <KeyIcon className="w-3.5 h-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent showArrow>
                              {t('table.ssoLinked', { providers: ssoProviderNames || '-' })}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-default-300">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>

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
};
