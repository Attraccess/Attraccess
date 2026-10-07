import { PageHeader, PageAction } from '../../components/pageHeader';
import { Button, TextField, InputGroup } from '@heroui/react';
import { SearchIcon, UserPlusIcon, Users } from 'lucide-react';
import { TableToolbar } from '../../components/TableToolbar';
import { InviteUserModal } from './invite-user-modal';
import { SimplePagination } from '../../components/simplePagination';
import { useUserManagementPageState } from './useUserManagementPageState';
import { UserManagementPageFiltersLabel } from './UserManagementPageFiltersLabel';
import { UserManagementPageTable } from './UserManagementPageTable';

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

        <UserManagementPageTable
          {...{ t, searchResult, roleIds, roles, providersById, navigate, assignRoleId, roleName }}
        />

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
