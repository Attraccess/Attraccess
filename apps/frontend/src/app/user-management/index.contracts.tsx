export type FilterKey = 'role' | 'emailVerified' | 'ssoProvider';
export type FilterOption = {
  key: string;
  label: string;
};
export type MultiValueCondition = 'any' | 'all' | 'none';
