export type MultiValueCondition = 'any' | 'all' | 'none';

export type FilterKey = 'role' | 'emailVerified' | 'ssoProvider';

export type FilterOption = {
  key: string;
  label: string;
};

export type UpdateFilters = (update: (params: URLSearchParams) => void) => void;

export interface UserManagementFilters {
  page: number;
  setPage: (page: number) => void;
  search: string;
  roleIds: number[];
  excludeRoleIds: number[];
  roleMatch: 'any' | 'all';
  roleExcludes: boolean;
  emailVerified: string | null;
  ssoProviderIds: number[];
  excludeSsoProviderIds: number[];
  ssoProviderNone: boolean;
  hasSsoProvider: boolean;
  ssoProviderMatch: 'any' | 'all';
  ssoProviderExcludes: boolean;
  assignRoleId: number | undefined;
  activeFilters: FilterKey[];
  updateFilters: UpdateFilters;
  addFilter: (filter: FilterKey) => void;
  removeFilter: (filter: FilterKey) => void;
  replaceFilter: (current: FilterKey, next: FilterKey) => void;
  startRoleAssignment: () => void;
}
