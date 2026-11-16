import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterKey, UserManagementFilters } from './types';

export const FILTER_KEYS: FilterKey[] = ['role', 'emailVerified', 'ssoProvider'];

/**
 * Filter, search and pagination state of the user management page, shared by the page (query, pagination),
 * the filter bar (editing filters) and the user table (empty state, role assignment link).
 */
export function useUserManagementFilters(): UserManagementFilters {
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

  const startRoleAssignment = () => {
    setSearchParams({
      assignRoleId: String(roleIds[0]),
    });
    setPage(1);
  };

  return {
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
    updateFilters,
    addFilter,
    removeFilter,
    replaceFilter,
    startRoleAssignment,
  };
}
