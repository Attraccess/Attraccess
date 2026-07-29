import { resolveSsoRoleAssignments, resolveRoleKeysFromSsoRoles } from './permission-mapping';

describe('resolveSsoRoleAssignments', () => {
  const mapping = {
    'user-manager': ['attraccess_admin'],
    'billing-manager': ['attraccess_billing', 'finance_team'],
  };

  it('returns empty when no mapping is configured', () => {
    expect(resolveSsoRoleAssignments(['attraccess_admin'], null)).toEqual([]);
    expect(resolveSsoRoleAssignments(['attraccess_admin'], {})).toEqual([]);
  });

  it('returns empty when no external role matches', () => {
    expect(resolveSsoRoleAssignments(['unrelated'], mapping)).toEqual([]);
  });

  it('resolves role keys with the original external claim value spelling', () => {
    // normalization strips case and separators; the original spelling is preserved as metadata
    const result = resolveSsoRoleAssignments(['Attraccess Admin', 'Finance-Team'], mapping);
    expect(result).toEqual(
      expect.arrayContaining([
        { roleKey: 'user-manager', externalValue: 'Attraccess Admin' },
        { roleKey: 'billing-manager', externalValue: 'Finance-Team' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('uses the first configured value that matches', () => {
    const result = resolveSsoRoleAssignments(['finance_team', 'attraccess_billing'], mapping);
    expect(result).toEqual([{ roleKey: 'billing-manager', externalValue: 'attraccess_billing' }]);
  });
});

describe('resolveRoleKeysFromSsoRoles', () => {
  it('returns the set of matched role keys', () => {
    const keys = resolveRoleKeysFromSsoRoles(['attraccess_admin'], { 'user-manager': ['attraccess_admin'] });
    expect([...keys]).toEqual(['user-manager']);
  });
});
