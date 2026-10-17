import { useMemo, useState } from 'react';
import {
  SSOProvider,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
  PaginatedUsersResponseDto,
  useUsersServiceFindMany,
  useRbacServiceListRoles,
} from '@attraccess/react-query-client';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from '../en.json';
import de from '../de.json';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';

export type MultiValueCondition = 'any' | 'all' | 'none';

export type FilterKey = 'role' | 'emailVerified' | 'ssoProvider';

export const FILTER_KEYS: FilterKey[] = ['role', 'emailVerified', 'ssoProvider'];

export function useUserManagementPageStateInputs() {
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
  return {
    t,
    roleName,
    limit,
    page,
    setPage,
    searchParams,
    setSearchParams,
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
    debouncedSearch,
    navigate,
    roles,
    searchResult,
    isFetchedSearchResult,
    updateFilters,
    addFilter,
    removeFilter,
    replaceFilter,
  } as const;
}

export function useUserManagementPageStateOutput(model: ReturnType<typeof useUserManagementPageStateInputs>) {
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
    replaceFilter: model.replaceFilter,
    setRoleCondition,
    setSsoProviderCondition,
    startRoleAssignment,
    totalPages,
    ssoProviders,
    providersById,
  };
}

export function useUserManagementPageState() {
  const useUserManagementPageStateInputsModel = useUserManagementPageStateInputs();
  return useUserManagementPageStateOutput(useUserManagementPageStateInputsModel);
}

export type Props = Pick<
  ReturnType<typeof useUserManagementPageState>,
  | 't'
  | 'activeFilters'
  | 'replaceFilter'
  | 'roleExcludes'
  | 'roleMatch'
  | 'setRoleCondition'
  | 'roles'
  | 'roleName'
  | 'excludeRoleIds'
  | 'roleIds'
  | 'updateFilters'
  | 'emailVerified'
  | 'ssoProviderExcludes'
  | 'ssoProviderMatch'
  | 'setSsoProviderCondition'
  | 'ssoProviders'
  | 'ssoProviderNone'
  | 'hasSsoProvider'
  | 'excludeSsoProviderIds'
  | 'ssoProviderIds'
  | 'removeFilter'
  | 'addFilter'
>;
