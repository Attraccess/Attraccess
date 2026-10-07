import { useMemo } from 'react';
import {
  SSOProvider,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
} from '@attraccess/react-query-client';
import { FilterKey } from './index.contracts';
import { MultiValueCondition } from './index.contracts';
import type { useUserManagementPageStateInputs } from './useUserManagementPageStateInputs';
export function useUserManagementPageStateOutput(model: ReturnType<typeof useUserManagementPageStateInputs>) {
  const replaceFilter = (current: FilterKey, next: FilterKey) => {
    if (current === next || model.activeFilters.includes(next)) return;
    model.updateFilters((params) => {
      params.delete('filter');
      model.activeFilters.map((key) => (key === current ? next : key)).forEach((key) => params.append('filter', key));
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
    model.updateFilters((params) => {
      const selectedIds = model.roleExcludes ? model.excludeRoleIds : model.roleIds;
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
    model.updateFilters((params) => {
      const selectedIds = model.ssoProviderExcludes ? model.excludeSsoProviderIds : model.ssoProviderIds;
      params.delete('ssoProviderId');
      params.delete('excludeSsoProviderId');
      params.delete('ssoProviderNone');
      params.delete('hasSsoProvider');
      if (condition === 'none') {
        if (model.ssoProviderNone) {
          params.set('hasSsoProvider', 'true');
        } else {
          selectedIds.forEach((id) => params.append('excludeSsoProviderId', String(id)));
        }
        params.delete('ssoProviderMatch');
        params.set('ssoProviderOperator', 'none');
      } else {
        selectedIds.forEach((id) => params.append('ssoProviderId', String(id)));
        if (model.hasSsoProvider) params.set('ssoProviderNone', 'true');
        params.set('ssoProviderMatch', condition);
        params.delete('ssoProviderOperator');
      }
    });

  const startRoleAssignment = () => {
    model.setSearchParams({
      assignRoleId: String(model.roleIds[0]),
    });
    model.setPage(1);
  };

  const totalPages = useMemo(() => {
    if (!model.searchResult?.total) {
      return 1;
    }
    return Math.ceil(model.searchResult.total / model.limit);
  }, [model.searchResult?.total, model.limit]);

  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });

  const providersById = useMemo(
    () => new Map((ssoProviders ?? []).map((provider: SSOProvider) => [provider.id, provider])),
    [ssoProviders],
  );
  return {
    t: model.t,
    roleName: model.roleName,
    page: model.page,
    setPage: model.setPage,
    search: model.search,
    roleIds: model.roleIds,
    excludeRoleIds: model.excludeRoleIds,
    roleMatch: model.roleMatch,
    roleExcludes: model.roleExcludes,
    emailVerified: model.emailVerified,
    ssoProviderIds: model.ssoProviderIds,
    excludeSsoProviderIds: model.excludeSsoProviderIds,
    ssoProviderNone: model.ssoProviderNone,
    hasSsoProvider: model.hasSsoProvider,
    ssoProviderMatch: model.ssoProviderMatch,
    ssoProviderExcludes: model.ssoProviderExcludes,
    assignRoleId: model.assignRoleId,
    activeFilters: model.activeFilters,
    navigate: model.navigate,
    roles: model.roles,
    searchResult: model.searchResult,
    isFetchedSearchResult: model.isFetchedSearchResult,
    updateFilters: model.updateFilters,
    addFilter: model.addFilter,
    removeFilter: model.removeFilter,
    replaceFilter,
    setRoleCondition,
    setSsoProviderCondition,
    startRoleAssignment,
    totalPages,
    ssoProviders,
    providersById,
  } as const;
}
