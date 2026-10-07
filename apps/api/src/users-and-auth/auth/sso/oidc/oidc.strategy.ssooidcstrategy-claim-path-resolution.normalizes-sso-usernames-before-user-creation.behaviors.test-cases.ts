import { Profile } from 'passport-openidconnect';
import { User, SSOProviderOIDCConfiguration, SSOProviderType, SSOProvider } from '@attraccess/database-entities';
import { registerSsooidcstrategyClaimPathResolutionFixture } from './oidc.strategy.ssooidcstrategy-claim-path-resolution.test-fixture';

export function registerNormalizesSsoUsernamesBeforeUserCreationCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('normalizes SSO usernames before user creation', async () => {
    const usersService = {
      findOne: jest.fn(async () => null),
      updateOne: jest.fn(),
      buildUsernameFromSSOClaim: jest.fn(() => 'name.surname'),
      createOne: jest.fn(
        async ({ username, email, externalIdentifier }) =>
          ({
            id: 123,
            username,
            email,
            externalIdentifier,
          }) as unknown as User,
      ),
    };

    const authService = {
      findUserIdBySSO: jest.fn(async () => null),
      addAuthenticationDetails: jest.fn(),
    };

    const strategy = fixture.createStrategy(
      {
        usernameClaimPaths: ['customUser'],
      },
      usersService,
      authService,
    );

    const profile = {
      id: 'ext-3',
      emails: [{ value: 'user@example.com' }],
      _json: { customUser: 'Name Surname' },
    } as unknown as Profile;

    const user = await strategy.validate('https://issuer', profile);
    expect(usersService.buildUsernameFromSSOClaim).toHaveBeenCalledWith('Name Surname', 'user@example.com');
    expect(user.username).toBe('name.surname');
    expect(usersService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'name.surname',
        email: 'user@example.com',
      }),
    );
  });
}

export function registerPassesTheExternalClaimValueThatGrantedEachRoleToTheSyncCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('passes the external claim value that granted each role to the sync', async () => {
    const existingUser = { id: 334, username: 'existing', email: 'existing@example.com' } as User;

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
      id: 'ext-external-value',
      emails: [{ value: 'existing@example.com' }],
      _json: { groups: ['Attraccess Admin'] }, // matches 'attraccess_admin' after normalization
    } as unknown as Profile;

    await strategy.validate('https://issuer', profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
      existingUser.id,
      [{ roleKey: 'user-manager', externalValue: 'Attraccess Admin' }],
      SSOProviderType.OIDC,
      1,
    );
  });
}

export function registerRecordsACreatedUserEvenWhenALaterRoleSyncFailsCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('records a created user even when a later role sync fails', async () => {
    const usersService = {
      findOne: jest.fn().mockResolvedValue(null),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
      createOne: jest.fn().mockResolvedValue({ id: 123, username: 'user', email: 'user@example.com' }),
    };
    const authService = { findUserIdBySSO: jest.fn().mockResolvedValue(null), addAuthenticationDetails: jest.fn() };
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
      { syncSsoRoles: jest.fn().mockRejectedValue(new Error('role write failed')) },
      { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) },
      audit,
    );

    await expect(
      strategy.validate('https://issuer', {
        id: 'subject',
        emails: [{ value: 'user@example.com' }],
        _json: { groups: ['admins'] },
      } as unknown as Profile),
    ).rejects.toThrow('role write failed');

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sso.provisioning.user_created', subject: { type: 'user', id: 123 } }),
    );
  });
}

export function registerRecordsANewlyCreatedUserBeforeBindingFailureWithoutSilentlyDeletingItCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('records a newly created user before binding failure without silently deleting it', async () => {
    const usersService = {
      findOne: jest.fn().mockResolvedValue(null),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
      createOne: jest.fn().mockResolvedValue({ id: 123, username: 'user', email: 'user@example.com' }),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    const authService = {
      findUserIdBySSO: jest.fn().mockResolvedValue(null),
      addAuthenticationDetails: jest.fn().mockRejectedValue(new Error('binding failed')),
    };
    const audit = { record: jest.fn() };
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
        roleMappings: null,
      },
    } as SSOProvider;
    const strategy = fixture.createStrategy(
      {},
      usersService,
      authService,
      undefined,
      { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) },
      audit,
    );

    await expect(
      strategy.validate('https://issuer', {
        id: 'subject',
        emails: [{ value: 'user@example.com' }],
      } as unknown as Profile),
    ).rejects.toThrow('binding failed');

    expect(usersService.deleteOne).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sso.provisioning.user_created', subject: { type: 'user', id: 123 } }),
    );
  });
}

export function registerRejectsMissingSubjectOrEmailBeforeAccountCreationAndHandlesAnUnsuccessfulCases(
  fixture: ReturnType<typeof registerSsooidcstrategyClaimPathResolutionFixture>,
) {
  it('rejects missing subject or email before account creation and handles an unsuccessful create', async () => {
    const users = {
      findOne: jest.fn().mockResolvedValue(null),
      createOne: jest.fn().mockResolvedValue(null),
      buildUsernameFromSSOClaim: jest.fn((value) => value),
    };
    const auth = { findUserIdBySSO: jest.fn().mockResolvedValue(null), addAuthenticationDetails: jest.fn() };
    const strategy = fixture.createStrategy({}, users, auth);
    await expect(strategy.validate('issuer', {} as Profile)).rejects.toThrow('No user ID');
    await expect(strategy.validate('issuer', { id: 'subject' } as Profile)).rejects.toThrow('No email');
    expect(users.createOne).not.toHaveBeenCalled();
    await expect(
      strategy.validate('issuer', { id: 'subject', emails: [{ value: 'user@example.com' }] } as Profile),
    ).rejects.toThrow('Unauthorized');
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
  });
}
