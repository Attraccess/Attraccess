import { UnauthorizedException } from '@nestjs/common';
import { AuthenticationType, SSOProviderType, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { UsersService } from '../../../users/users.service';
import { AuthService } from '../../auth.service';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { SsoAccountResolver, SsoProvisioningHook } from './sso-account-resolver.service';

describe('SsoAccountResolver', () => {
  const manager = { tag: 'manager' };
  const input = {
    providerType: SSOProviderType.SAML,
    providerId: 3,
    subject: 'name-id',
    email: 'user@example.com',
    emailVerified: undefined as boolean | undefined,
    usernameClaim: 'Some Name',
  };

  function setup({ bound = null, byEmail = null }: { bound?: number | null; byEmail?: Partial<User> | null } = {}) {
    const users = {
      findOne: jest.fn(async (query: Record<string, unknown>) =>
        'id' in query ? ({ id: query.id } as User) : (byEmail as User | null),
      ),
      createOne: jest.fn(async () => ({ id: 77 }) as User),
      buildUsernameFromSSOClaim: jest.fn((value: string) => `built:${value}`),
      recordCreatedUser: jest.fn(),
    };
    const auth = {
      findUserIdBySSO: jest.fn().mockResolvedValue(bound),
      addAuthenticationDetails: jest.fn().mockResolvedValue({}),
    };
    const dataSource = { transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)) };
    const resolver = new SsoAccountResolver(
      users as unknown as UsersService,
      auth as unknown as AuthService,
      dataSource as unknown as DataSource,
    );
    return { users, auth, dataSource, resolver };
  }

  it('returns the user bound to (type, provider, subject) without touching email or creation', async () => {
    const { resolver, users, auth } = setup({ bound: 5 });
    await expect(resolver.resolveSsoUser(input)).resolves.toEqual({ user: { id: 5 }, created: false });
    expect(auth.findUserIdBySSO).toHaveBeenCalledWith(SSOProviderType.SAML, 3, 'name-id');
    expect(users.findOne).not.toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(users.createOne).not.toHaveBeenCalled();
  });

  it.each([undefined, true])(
    'requires account linking for an email match without binding (emailVerified %p), whatever its auth details',
    async (emailVerified) => {
      const { resolver, users, auth } = setup({ byEmail: { id: 9, authenticationDetails: [] } });
      await expect(resolver.resolveSsoUser({ ...input, emailVerified })).rejects.toMatchObject({
        email: 'user@example.com',
        externalId: 'name-id',
        providerId: 3,
        providerType: SSOProviderType.SAML,
      });
      await expect(resolver.resolveSsoUser({ ...input, emailVerified })).rejects.toBeInstanceOf(
        AccountLinkingRequiredException,
      );
      expect(users.createOne).not.toHaveBeenCalled();
      expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
    },
  );

  it('creates the user and its binding in one transaction when nothing matches', async () => {
    const { resolver, users, auth, dataSource } = setup();
    await expect(resolver.resolveSsoUser(input)).resolves.toEqual({ user: { id: 77 }, created: true });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(users.buildUsernameFromSSOClaim).toHaveBeenCalledWith('Some Name', 'user@example.com');
    expect(users.createOne).toHaveBeenCalledWith(
      { username: 'built:Some Name', email: 'user@example.com', externalIdentifier: null, isEmailVerified: true },
      manager,
    );
    expect(auth.addAuthenticationDetails).toHaveBeenCalledWith(
      77,
      {
        type: AuthenticationType.SSO,
        details: { providerId: 3, providerType: SSOProviderType.SAML, subject: 'name-id' },
      },
      manager,
    );
  });

  it('records the created-user metrics only after the transaction committed', async () => {
    const created = setup();
    await created.resolver.resolveSsoUser(input);
    expect(created.users.recordCreatedUser).toHaveBeenCalledWith({ id: 77 });
    const failing = setup();
    failing.auth.addAuthenticationDetails.mockRejectedValue(new Error('binding failed'));
    await expect(failing.resolver.resolveSsoUser(input)).rejects.toThrow('binding failed');
    expect(failing.users.recordCreatedUser).not.toHaveBeenCalled();
  });

  it('falls back to the email as username claim', async () => {
    const { resolver, users } = setup();
    await resolver.resolveSsoUser({ ...input, usernameClaim: undefined });
    expect(users.buildUsernameFromSSOClaim).toHaveBeenCalledWith('user@example.com', 'user@example.com');
  });

  it('lets the provisioning hook reject without creating anything', async () => {
    const { resolver, users, auth } = setup();
    const hook: SsoProvisioningHook = jest.fn().mockResolvedValue('reject');
    await expect(resolver.resolveSsoUser(input, { provisioning: hook })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ subject: 'name-id', emailTrusted: true }));
    expect(users.createOne).not.toHaveBeenCalled();
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
  });

  it('does not consult the hook when the identity is bound or the email matches', async () => {
    const hook: SsoProvisioningHook = jest.fn().mockResolvedValue('create');
    await setup({ bound: 5 }).resolver.resolveSsoUser(input, { provisioning: hook });
    await setup({ byEmail: { id: 9 } })
      .resolver.resolveSsoUser(input, { provisioning: hook })
      .catch(() => undefined);
    expect(hook).not.toHaveBeenCalled();
  });

  it('skips the email match for an unverified email and creates an unverified user', async () => {
    const { resolver, users } = setup();
    await resolver.resolveSsoUser({ ...input, emailVerified: false });
    expect(users.createOne).toHaveBeenCalledWith(expect.objectContaining({ isEmailVerified: false }), manager);
  });

  it('rejects an unverified email that collides with an existing account, never linking', async () => {
    const { resolver, users, auth } = setup({ byEmail: { id: 9 } });
    const error = await resolver.resolveSsoUser({ ...input, emailVerified: false }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error).toMatchObject({ message: 'SSO_EMAIL_NOT_VERIFIED' });
    expect(users.createOne).not.toHaveBeenCalled();
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
  });

  it('fails the login when user creation returns nothing or the binding fails', async () => {
    const empty = setup();
    empty.users.createOne.mockResolvedValue(null as never);
    await expect(empty.resolver.resolveSsoUser(input)).rejects.toBeInstanceOf(UnauthorizedException);
    const failing = setup();
    failing.auth.addAuthenticationDetails.mockRejectedValue(new Error('binding failed'));
    await expect(failing.resolver.resolveSsoUser(input)).rejects.toThrow('binding failed');
  });
});
