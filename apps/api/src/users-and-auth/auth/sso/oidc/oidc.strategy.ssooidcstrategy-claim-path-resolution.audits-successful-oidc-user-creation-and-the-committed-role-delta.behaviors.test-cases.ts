import { Profile, Strategy } from 'passport-openidconnect';
import { SSOProvider, SSOProviderType, SSOProviderOIDCConfiguration, User } from '@attraccess/database-entities';
import { registerSsooidcstrategyClaimPathResolutionFixture } from './oidc.strategy.ssooidcstrategy-claim-path-resolution.test-fixture';
import { SSOOIDCStrategy, SSO_OIDC_CALLBACK_URL_REQUEST_KEY } from './oidc.strategy';

export function registerAuditsSuccessfulOidcUserCreationAndTheCommittedRoleDeltaCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('audits successful OIDC user creation and the committed role delta', async () => {
    const usersService = {
      findOne: jest.fn().mockResolvedValue(null),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
      createOne: jest.fn().mockResolvedValue({ id: 123, username: 'user', email: 'user@example.com' }),
    };
    const authService = { findUserIdBySSO: jest.fn().mockResolvedValue(null), addAuthenticationDetails: jest.fn() };
    const rbacService = {
      syncSsoRoles: jest.fn().mockResolvedValue({ added: ['user-manager'], removed: [], updated: [] }),
    };
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const provider = {
      id: 1,
      name: 'Workforce',
      type: SSOProviderType.OIDC,
      oidcConfiguration: {
        issuer: 'https://issuer',
        authorizationURL: 'https://issuer/auth',
        tokenURL: 'https://issuer/token',
        userInfoURL: 'https://issuer/userinfo',
        clientId: 'client',
        scopes: null,
        usernameClaimPaths: null,
        emailClaimPaths: null,
        roleMappings: { 'user-manager': ['admins'] },
      },
    } as SSOProvider;
    const strategy = fixture.createStrategy(
      { roleMappings: { 'user-manager': ['admins'] } },
      usersService,
      authService,
      rbacService,
      { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) },
      audit,
    );

    await strategy.validate('https://issuer', {
      id: 'subject',
      emails: [{ value: 'user@example.com' }],
      _json: { groups: ['admins'] },
    } as unknown as Profile);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sso.provisioning.user_created', subject: { type: 'user', id: 123 } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sso.provisioning.permissions_synced',
        details: expect.objectContaining({
          changes: JSON.stringify({ added: ['user-manager'], removed: [], updated: [] }),
        }),
      }),
    );
  });
}

export function registerAuthenticatePerRequestCallbackUrlCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  describe('authenticate (per-request callback URL)', () => {
    it('passes callback URL from request to base strategy when set (no restart needed for URL changes)', () => {
      const baseAuthenticateSpy = jest.spyOn(Strategy.prototype, 'authenticate').mockImplementation(() => {
        /* noop: avoid running real Passport strategy */
      });
      const strategy = fixture.createStrategy(
        {},
        {
          findOne: jest.fn(),
          updateOne: jest.fn(),
          buildUsernameFromSSOClaim: jest.fn((s: string) => s),
          createOne: jest.fn(),
        },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      const dynamicCallback = 'https://api.example.com/api/auth/sso/oidc/1/callback?redirectTo=/dashboard';
      const req = { [SSO_OIDC_CALLBACK_URL_REQUEST_KEY]: dynamicCallback } as unknown as Parameters<
        SSOOIDCStrategy['authenticate']
      >[0];

      strategy.authenticate(req, undefined);

      expect(baseAuthenticateSpy).toHaveBeenCalledWith(req, { callbackURL: dynamicCallback });
      baseAuthenticateSpy.mockRestore();
    });

    it('passes through options when request has no callback URL key', () => {
      const baseAuthenticateSpy = jest.spyOn(Strategy.prototype, 'authenticate').mockImplementation(() => {
        /* noop */
      });
      const strategy = fixture.createStrategy(
        {},
        {
          findOne: jest.fn(),
          updateOne: jest.fn(),
          buildUsernameFromSSOClaim: jest.fn((s: string) => s),
          createOne: jest.fn(),
        },
        { findUserIdBySSO: jest.fn(), addAuthenticationDetails: jest.fn() },
      );
      const req = {} as unknown as Parameters<SSOOIDCStrategy['authenticate']>[0];
      const options = undefined;

      strategy.authenticate(req, options);

      expect(baseAuthenticateSpy).toHaveBeenCalledWith(req, options);
      baseAuthenticateSpy.mockRestore();
    });
  });
}

export function registerDoesNotSyncWhenTheTokenContainsNoRoleGroupClaimsAtAllCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('does not sync when the token contains no role/group claims at all', async () => {
    const existingUser = { id: 336, username: 'existing', email: 'existing@example.com' } as User;

    const usersService = { findOne: jest.fn(async () => existingUser), updateOne: jest.fn(), createOne: jest.fn() };
    const authService = { findUserIdBySSO: jest.fn(async () => existingUser.id), addAuthenticationDetails: jest.fn() };
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const strategy = fixture.createStrategy(
      { roleMappings: { 'user-manager': ['attraccess_admin'] } } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-no-claims',
      emails: [{ value: 'existing@example.com' }],
      _json: { email: 'existing@example.com' }, // no roles/groups keys → missing scope, do not revoke
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
  });
}

export function registerHonorsConfiguredPermissionMappingsAndRevokesAbsentRolesCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('honors configured permission mappings and revokes absent roles', async () => {
    const existingUser = { id: 333, username: 'existing', email: 'existing@example.com' } as User;

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

    const strategy = fixture.createStrategy(
      {
        roleMappings: { 'user-manager': ['attraccess_admin'] },
      } as Partial<SSOProviderOIDCConfiguration>,
      usersService,
      authService,
      rbacService,
    );

    const profile = {
      id: 'ext-mapping',
      emails: [{ value: 'existing@example.com' }],
      _json: { roles: ['other-role'] }, // 'other-role' not in mapping → no roles granted
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    // syncSsoRoles called with empty set; existing SSO roles will be revoked
    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(existingUser.id, [], SSOProviderType.OIDC, 1);
  });
}

export function registerMapsRoleStringsArraysAndObjectValuedClaimsWhileIgnoringNonStringEntriesCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('maps role strings, arrays and object-valued claims while ignoring non-string entries', async () => {
    const user = { id: 7 } as User;
    const users = { findOne: jest.fn().mockResolvedValue(user) };
    const auth = { findUserIdBySSO: jest.fn().mockResolvedValue(7) };
    const rbac = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };
    const strategy = fixture.createStrategy(
      {
        roleMappings: { operator: ['staff'], supervisor: ['leads'], member: ['members'] },
        emailClaimPaths: ['missing.path'],
      },
      users,
      auth,
      rbac,
    );
    await strategy.validate('issuer', {
      id: 'subject',
      emails: [{ value: 'user@example.com' }],
      _json: {
        roles: { direct: 'staff', nested: ['leads', 4], ignored: 99 },
        groups: 'members',
        permissions: ['staff', null],
      },
    } as unknown as Profile);
    expect(rbac.syncSsoRoles).toHaveBeenCalledWith(
      7,
      expect.arrayContaining([
        expect.objectContaining({ roleKey: 'operator' }),
        expect.objectContaining({ roleKey: 'supervisor' }),
        expect.objectContaining({ roleKey: 'member' }),
      ]),
      SSOProviderType.OIDC,
      1,
    );
  });
}
