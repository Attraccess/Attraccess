import React, { useMemo, useState } from 'react';
import { PageHeader, PageAction } from '../../components/pageHeader';
import { AttraccessUser, useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Chip,
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
import { KeyIcon, PlusIcon, SearchIcon, ShieldCheckIcon, ShieldOffIcon, UserPlusIcon, Users, XIcon } from 'lucide-react';
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

const FILTER_KEYS: FilterKey[] = ['role', 'emailVerified', 'ssoProvider'];

function MultiValueFilter({
  ariaLabel,
  options,
  selectedKeys,
  onSelectionChange,
  dataCy,
}: {
  ariaLabel: string;
  options: FilterOption[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  dataCy: string;
}) {
  const { contains } = useFilter({ sensitivity: 'base' });

  return (
    <Autocomplete
      className="min-w-28"
      placeholder={ariaLabel}
      selectionMode="multiple"
      value={selectedKeys}
      onChange={(keys) => onSelectionChange([...keys].map(String))}
      aria-label={ariaLabel}
      data-cy={dataCy}
    >
      <Autocomplete.Trigger>
        <Autocomplete.Value>
          {() => options.filter((option) => selectedKeys.includes(option.key)).map((option) => option.label).join(', ') || ariaLabel}
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
  const roleMatch = searchParams.get('roleMatch') === 'all' ? 'all' : 'any';
  const emailVerified = searchParams.get('emailVerified');
  const ssoProviderIds = searchParams.getAll('ssoProviderId').map(Number).filter(Number.isInteger);
  const ssoProviderNone = searchParams.get('ssoProviderNone') === 'true';
  const ssoProviderMatch = searchParams.get('ssoProviderMatch') === 'all' ? 'all' : 'any';
  const assignRoleId = Number(searchParams.get('assignRoleId')) || undefined;
  const activeFilters = FILTER_KEYS.filter(
    (filter) =>
      searchParams.getAll('filter').includes(filter) ||
      (filter === 'role' && roleIds.length > 0) ||
      (filter === 'emailVerified' && emailVerified !== null) ||
      (filter === 'ssoProvider' && (ssoProviderIds.length > 0 || ssoProviderNone)),
  );

  const debouncedSearch = useDebounce(search, 500);

  const navigate = useNavigate();
  const { data: roles } = useRbacServiceListRoles();

  const { data: searchResult, isFetched: isFetchedSearchResult } = useUsersServiceFindMany<PaginatedUsersResponseDto>({
    limit,
    page,
    search: debouncedSearch,
    roleIds,
    roleMatch,
    emailVerified: emailVerified === null ? undefined : emailVerified === 'true',
    ssoProviderIds,
    ssoProviderNone,
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

  const addFilter = (filter: FilterKey) =>
    updateFilters((params) => params.append('filter', filter));

  const removeFilter = (filter: FilterKey) =>
    updateFilters((params) => {
      params.delete('filter');
      activeFilters.filter((key) => key !== filter).forEach((key) => params.append('filter', key));
      if (filter === 'role') {
        params.delete('roleId');
        params.delete('roleMatch');
      }
      if (filter === 'emailVerified') params.delete('emailVerified');
      if (filter === 'ssoProvider') {
        params.delete('ssoProviderId');
        params.delete('ssoProviderNone');
        params.delete('ssoProviderMatch');
      }
    });

  const replaceFilter = (current: FilterKey, next: FilterKey) => {
    if (current === next || activeFilters.includes(next)) return;
    updateFilters((params) => {
      params.delete('filter');
      activeFilters.map((key) => (key === current ? next : key)).forEach((key) => params.append('filter', key));
      if (current === 'role') {
        params.delete('roleId');
        params.delete('roleMatch');
      }
      if (current === 'emailVerified') params.delete('emailVerified');
      if (current === 'ssoProvider') {
        params.delete('ssoProviderId');
        params.delete('ssoProviderNone');
        params.delete('ssoProviderMatch');
      }
    });
  };

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
              <TextField value={search} onChange={(value) => updateFilters((params) => value ? params.set('q', value) : params.delete('q'))} aria-label={t('table.inputs.search')}>
                <InputGroup>
                  <InputGroup.Prefix>
                    <SearchIcon size={16} />
                  </InputGroup.Prefix>
                  <InputGroup.Input placeholder={t('table.inputs.search')} data-cy="user-management-search-input" />
                </InputGroup>
              </TextField>
              <div className="flex flex-wrap items-center gap-2" aria-label={t('filters.label')}>
                {activeFilters.map((filter) => (
                  <div key={filter} role="group" aria-label={t(`filters.${filter}`)} className="flex max-w-full flex-wrap items-center rounded-medium border border-default-200 bg-content1 text-sm shadow-xs">
                    <Select
                      className="min-w-24"
                      aria-label={t('filters.category')}
                      value={filter}
                      onChange={(value) => replaceFilter(filter, value as FilterKey)}
                      items={FILTER_KEYS.filter((key) => key === filter || !activeFilters.includes(key)).map((key) => ({ key, label: t(`filters.${key}`) }))}
                    />
                    {filter === 'role' ? (
                      <>
                        <Select
                          className="min-w-28"
                          aria-label={t('filters.roleMatch')}
                          value={roleMatch}
                          onChange={(value) => updateFilters((params) => params.set('roleMatch', value))}
                          items={[{ key: 'any', label: t('filters.isAnyOf') }, { key: 'all', label: t('filters.isAllOf') }]}
                        />
                        <MultiValueFilter
                          ariaLabel={t('filters.roleValues')}
                          options={(roles ?? []).map((role) => ({ key: String(role.id), label: roleName(role) }))}
                          selectedKeys={roleIds.map(String)}
                          onSelectionChange={(keys) => updateFilters((params) => {
                            params.delete('roleId');
                            keys.forEach((key) => params.append('roleId', key));
                            if (keys.length === 0) params.delete('roleMatch');
                          })}
                          dataCy="user-management-role-filter"
                        />
                      </>
                    ) : filter === 'emailVerified' ? (
                      <>
                        <span className="border-x border-default-200 px-3 py-1.5 text-default-500">{t('filters.is')}</span>
                        <SingleValueFilter
                          ariaLabel={t('filters.emailVerificationStatus')}
                          options={[{ key: 'true', label: t('filters.verified') }, { key: 'false', label: t('filters.notVerified') }]}
                          selectedKey={emailVerified === 'true' || emailVerified === 'false' ? emailVerified : undefined}
                          onSelectionChange={(key) => updateFilters((params) => key ? params.set('emailVerified', key) : params.delete('emailVerified'))}
                          dataCy="user-management-email-verified-filter"
                        />
                      </>
                    ) : (
                      <>
                        <Select
                          className="min-w-28"
                          aria-label={t('filters.ssoProviderMatch')}
                          value={ssoProviderMatch}
                          onChange={(value) => updateFilters((params) => params.set('ssoProviderMatch', value))}
                          items={[{ key: 'any', label: t('filters.isAnyOf') }, { key: 'all', label: t('filters.isAllOf') }]}
                        />
                        <MultiValueFilter
                          ariaLabel={t('filters.ssoProviderValues')}
                          options={[{ key: 'none', label: t('filters.none') }, ...(ssoProviders ?? []).map((provider) => ({ key: String(provider.id), label: provider.name }))]}
                          selectedKeys={[...(ssoProviderNone ? ['none'] : []), ...ssoProviderIds.map(String)]}
                          onSelectionChange={(keys) => updateFilters((params) => {
                            params.delete('ssoProviderId');
                            params.delete('ssoProviderNone');
                            if (keys.includes('none')) params.set('ssoProviderNone', 'true');
                            keys.filter((key) => key !== 'none').forEach((key) => params.append('ssoProviderId', key));
                            if (keys.length === 0) params.delete('ssoProviderMatch');
                          })}
                          dataCy="user-management-sso-provider-filter"
                        />
                      </>
                    )}
                    <Button isIconOnly size="sm" variant="ghost" aria-label={t('filters.remove')} onPress={() => removeFilter(filter)}>
                      <XIcon size={14} />
                    </Button>
                  </div>
                ))}
                {activeFilters.length < FILTER_KEYS.length ? (
                  <Dropdown>
                    <DropdownTrigger className="inline-flex">
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
                  roleIds.length ? <EmptyState message={t('empty.role', { role: roles?.find((role) => role.id === roleIds[0])?.name ?? roleIds[0] })} /> : <EmptyState />
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
                        navigate(
                          assignRoleId
                            ? `/users/${user.id}?assignRoleId=${assignRoleId}`
                            : `/users/${user.id}`,
                        )
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
