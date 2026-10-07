import { useState } from 'react';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  PaginatedUsersResponseDto,
  useUsersServiceFindMany,
  useRbacServiceListRoles,
} from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';
import { FilterKey } from './index.contracts';
import { FILTER_KEYS } from './index.state';
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
  } as const;
}
