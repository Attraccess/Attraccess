import { hasConfiguredPermissionMapping } from './sso-permission-mapping';

describe('hasConfiguredPermissionMapping', () => {
  it('returns false for null/undefined', () => {
    expect(hasConfiguredPermissionMapping(null)).toBe(false);
    expect(hasConfiguredPermissionMapping(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(hasConfiguredPermissionMapping({})).toBe(false);
  });

  it('returns false when all arrays are empty', () => {
    expect(
      hasConfiguredPermissionMapping({
        canManageUsers: [],
        canManageResources: [],
      }),
    ).toBe(false);
  });

  it('returns true when at least one permission has non-empty mapping', () => {
    expect(
      hasConfiguredPermissionMapping({
        canManageUsers: ['admins'],
      }),
    ).toBe(true);
    expect(
      hasConfiguredPermissionMapping({
        canManageUsers: [],
        canManageResources: ['resource-admins'],
      }),
    ).toBe(true);
  });
});
