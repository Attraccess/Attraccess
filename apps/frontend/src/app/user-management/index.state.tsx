import type { FilterKey } from './index.contracts';
export // Role keys that are considered "default" and not worth showing in the list
const DEFAULT_ROLE_KEYS = new Set(['user']);

export const FILTER_KEYS: FilterKey[] = ['role', 'emailVerified', 'ssoProvider'];
