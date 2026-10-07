import { Profile } from 'passport-openidconnect';
import { SSOProviderType, User } from '@attraccess/database-entities';
import { registerSsooidcstrategyClaimPathResolutionFixture } from './oidc.strategy.ssooidcstrategy-claim-path-resolution.test-fixture';
export function registerSyncsWithZeroAssignmentsWhenNoRoleMappingsConfiguredNoOpForFreshProviderCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('syncs with zero assignments when no roleMappings configured (no-op for fresh providers)', async () => {
    const existingUser = { id: 222, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = {
      findOne: jest.fn(async () => existingUser),
      updateOne: jest.fn(),
      createOne: jest.fn(),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => existingUser.id),
      addAuthenticationDetails: jest.fn(),
    };

    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const strategy = fixture.createStrategy({}, usersService, authService, rbacService);

    const profile = {
      id: 'ext-roles',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['some-role'] },
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(existingUser.id, [], SSOProviderType.OIDC, 1);
  });
}
