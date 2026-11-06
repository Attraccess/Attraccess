import { SSOProviderType } from '@attraccess/database-entities';
import { syncOidcRolesFromClaims } from './oidc-permission-claims';

describe('syncOidcRolesFromClaims', () => {
  const config = {
    ssoProviderId: 4,
    clientId: 'attraccess',
    roleMappings: { 'resource-manager': ['fab-staff'] },
  };
  const delta = { added: ['resource-manager'], removed: [], updated: [] };
  let rbac: { syncSsoRoles: jest.Mock };

  beforeEach(() => {
    rbac = { syncSsoRoles: jest.fn().mockResolvedValue(delta) };
  });

  it('maps claim values to role assignments and returns the sync delta', async () => {
    const result = await syncOidcRolesFromClaims(rbac, 7, config, [{ groups: ['fab-staff', 'other'] }]);

    expect(result).toBe(delta);
    expect(rbac.syncSsoRoles).toHaveBeenCalledWith(
      7,
      [{ roleKey: 'resource-manager', externalValue: 'fab-staff' }],
      SSOProviderType.OIDC,
      4,
    );
  });

  it('reads client roles from every claim source', async () => {
    await syncOidcRolesFromClaims(rbac, 7, config, [{}, { resource_access: { attraccess: { roles: ['fab-staff'] } } }]);
    expect(rbac.syncSsoRoles).toHaveBeenCalledWith(
      7,
      [expect.objectContaining({ roleKey: 'resource-manager' })],
      SSOProviderType.OIDC,
      4,
    );
  });

  it('does not sync when every role/group claim is absent', async () => {
    expect(await syncOidcRolesFromClaims(rbac, 7, config, [{ sub: 'person' }, undefined])).toBeUndefined();
    expect(rbac.syncSsoRoles).not.toHaveBeenCalled();
  });

  it('syncs zero assignments for a present-but-empty claim so granted roles are revoked', async () => {
    await syncOidcRolesFromClaims(rbac, 7, config, [{ groups: [] }]);
    expect(rbac.syncSsoRoles).toHaveBeenCalledWith(7, [], SSOProviderType.OIDC, 4);
  });

  it('syncs zero assignments when the mapping was cleared', async () => {
    await syncOidcRolesFromClaims(rbac, 7, { ...config, roleMappings: null }, [{ groups: ['fab-staff'] }]);
    expect(rbac.syncSsoRoles).toHaveBeenCalledWith(7, [], SSOProviderType.OIDC, 4);
  });

  it('reads only the configured roleClaimPaths (shared by login and session re-sync)', async () => {
    const custom = { ...config, roleClaimPaths: ['custom.roles'] };
    await syncOidcRolesFromClaims(rbac, 7, custom, [{ groups: ['fab-staff'], custom: { roles: ['fab-staff'] } }]);
    expect(rbac.syncSsoRoles).toHaveBeenLastCalledWith(
      7,
      [{ roleKey: 'resource-manager', externalValue: 'fab-staff' }],
      SSOProviderType.OIDC,
      4,
    );

    expect(await syncOidcRolesFromClaims(rbac, 7, custom, [{ groups: ['fab-staff'] }])).toBeUndefined();
  });

  it.each(['toString', 'hasOwnProperty', 'groups.toString', 'custom.valueOf', 'groups.length', 'flag'])(
    'treats %s (inherited or not a list) as absent so roles are kept',
    async (path) => {
      const custom = { ...config, roleClaimPaths: [path] };
      const sources = [{ groups: ['fab-staff'], custom: { roles: ['fab-staff'] }, flag: true }];
      expect(await syncOidcRolesFromClaims(rbac, 7, custom, sources)).toBeUndefined();
      expect(rbac.syncSsoRoles).not.toHaveBeenCalled();
    },
  );

  it('reads flat dotted keys, nested paths and array indexes from own properties', async () => {
    const custom = { ...config, roleClaimPaths: ['a.b', 'nested.list[1]'] };
    await syncOidcRolesFromClaims(rbac, 7, custom, [{ 'a.b': ['x'], nested: { list: ['y', 'fab-staff'] } }]);
    expect(rbac.syncSsoRoles).toHaveBeenCalledWith(
      7,
      [{ roleKey: 'resource-manager', externalValue: 'fab-staff' }],
      SSOProviderType.OIDC,
      4,
    );
  });
});
