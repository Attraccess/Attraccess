import { PageAction, PageHeader, useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, TextField, InputGroup } from '@heroui/react';
import { PaginatedUsersResponseDto, useUsersServiceFindMany } from '@attraccess/react-query-client';
import { SearchIcon, UserPlusIcon, Users } from 'lucide-react';
import { TableToolbar } from '../../components/TableToolbar/index';
import { InviteUserModal } from './invite-user-modal/index';
import { SimplePagination } from '../../components/simplePagination/index';
import { UserManagementPageFiltersLabel } from './filters/UserManagementPageFiltersLabel';
import { useUserManagementFilters } from './filters/useUserManagementFilters';
import { UserTable } from './components/UserTable';
import en from './en.json';
import de from './de.json';

const PAGE_SIZE = 10;

export function UserManagementPage() {
  const { t } = useTranslations({ en, de });
  const filters = useUserManagementFilters();
  const {
    page,
    setPage,
    search,
    roleIds,
    excludeRoleIds,
    roleMatch,
    emailVerified,
    ssoProviderIds,
    excludeSsoProviderIds,
    ssoProviderNone,
    hasSsoProvider,
    ssoProviderMatch,
    assignRoleId,
    updateFilters,
    startRoleAssignment,
  } = filters;
  const debouncedSearch = useDebounce(search, 500);

  const { data: searchResult, isFetched: isFetchedSearchResult } = useUsersServiceFindMany<PaginatedUsersResponseDto>({
    limit: PAGE_SIZE,
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

  const totalPages = searchResult?.total ? Math.ceil(searchResult.total / PAGE_SIZE) : 1;
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
              <UserManagementPageFiltersLabel filters={filters} />
            </div>
          }
        />

        <UserTable searchResult={searchResult} roleIds={roleIds} assignRoleId={assignRoleId} />

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
