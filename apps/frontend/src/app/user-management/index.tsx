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
  ListBox,
} from '@heroui/react';
import { KeyIcon, SearchIcon, ShieldCheckIcon, ShieldOffIcon, UserPlusIcon, Users } from 'lucide-react';
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

function MultiValueFilter({
  label,
  options,
  selectedKeys,
  onSelectionChange,
  dataCy,
}: {
  label: string;
  options: FilterOption[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  dataCy: string;
}) {
  return (
    <Autocomplete
      className="w-36"
      placeholder={label}
      selectionMode="multiple"
      value={selectedKeys}
      onChange={(keys) => onSelectionChange([...keys].map(String))}
      aria-label={label}
      data-cy={dataCy}
    >
      <Autocomplete.Trigger>
        <Autocomplete.Value>
          {() => (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{label}</span>
              {selectedKeys.length > 0 ? (
                <Chip size="sm" color="accent" variant="secondary" className="min-w-5 justify-center px-1">
                  {selectedKeys.length}
                </Chip>
              ) : null}
            </span>
          )}
        </Autocomplete.Value>
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <ListBox aria-label={label}>
          {options.map((option) => (
            <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

function SingleValueFilter({
  label,
  options,
  selectedKey,
  onSelectionChange,
  dataCy,
}: {
  label: string;
  options: FilterOption[];
  selectedKey?: string;
  onSelectionChange: (key?: string) => void;
  dataCy: string;
}) {
  return (
    <Autocomplete
      className="w-36"
      placeholder={label}
      value={selectedKey}
      onChange={(key) => onSelectionChange(key ? String(key) : undefined)}
      aria-label={label}
      data-cy={dataCy}
    >
      <Autocomplete.Trigger>
        <Autocomplete.Value>
          {() => (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{label}</span>
              {selectedKey ? (
                <Chip size="sm" color="accent" variant="secondary" className="min-w-5 justify-center px-1">
                  1
                </Chip>
              ) : null}
            </span>
          )}
        </Autocomplete.Value>
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <ListBox aria-label={label}>
          {options.map((option) => (
            <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
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
              <div className="flex flex-wrap gap-2" aria-label={t('filters.label')}>
                <div className="flex items-end gap-1">
                  <MultiValueFilter
                    label={t('filters.role')}
                    options={(roles ?? []).map((role) => ({ key: String(role.id), label: roleName(role) }))}
                    selectedKeys={roleIds.map(String)}
                    onSelectionChange={(keys) => updateFilters((params) => {
                      params.delete('roleId');
                      keys.forEach((key) => params.append('roleId', key));
                      if (keys.length === 0) params.delete('roleMatch');
                    })}
                    dataCy="user-management-role-filter"
                  />
                  {roleIds.length > 0 ? (
                    <Select
                      className="w-20"
                      aria-label={t('filters.roleMatch')}
                      value={roleMatch}
                      onChange={(value) => updateFilters((params) => params.set('roleMatch', value))}
                      items={[{ key: 'any', label: t('filters.any') }, { key: 'all', label: t('filters.all') }]}
                    />
                  ) : null}
                </div>
                <div className="flex items-end">
                  <SingleValueFilter
                    label={t('filters.emailVerified')}
                    options={[{ key: 'true', label: t('filters.verified') }, { key: 'false', label: t('filters.notVerified') }]}
                    selectedKey={emailVerified === 'true' || emailVerified === 'false' ? emailVerified : undefined}
                    onSelectionChange={(key) => updateFilters((params) => key ? params.set('emailVerified', key) : params.delete('emailVerified'))}
                    dataCy="user-management-email-verified-filter"
                  />
                </div>
                <div className="flex items-end gap-1">
                  <MultiValueFilter
                    label={t('filters.ssoProvider')}
                    options={[{ key: 'none', label: t('filters.none') }, ...(ssoProviders ?? []).map((provider) => ({ key: String(provider.id), label: provider.name }))]}
                    selectedKeys={ssoProviderNone ? ['none'] : ssoProviderIds.map(String)}
                    onSelectionChange={(keys) => updateFilters((params) => {
                      params.delete('ssoProviderId');
                      params.delete('ssoProviderNone');
                      if (keys.includes('none')) {
                        params.set('ssoProviderNone', 'true');
                      } else {
                        keys.forEach((key) => params.append('ssoProviderId', key));
                      }
                      if (keys.length === 0) params.delete('ssoProviderMatch');
                    })}
                    dataCy="user-management-sso-provider-filter"
                  />
                  {ssoProviderIds.length > 0 ? (
                    <Select
                      className="w-20"
                      aria-label={t('filters.ssoProviderMatch')}
                      value={ssoProviderMatch}
                      onChange={(value) => updateFilters((params) => params.set('ssoProviderMatch', value))}
                      items={[{ key: 'any', label: t('filters.any') }, { key: 'all', label: t('filters.all') }]}
                    />
                  ) : null}
                </div>
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
