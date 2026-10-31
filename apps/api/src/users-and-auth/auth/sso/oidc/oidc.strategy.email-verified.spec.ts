import { Profile } from 'passport-openidconnect';
import { User } from '@attraccess/database-entities';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { registerSsooidcstrategyClaimPathResolutionFixture } from './oidc.strategy.ssooidcstrategy-claim-path-resolution.test-fixture';

describe('SSOOIDCStrategy - email_verified', () => {
  const fixture = registerSsooidcstrategyClaimPathResolutionFixture();
  const profile = (json: Record<string, unknown> = {}) =>
    ({ id: 'subject', emails: [{ value: 'user@example.com' }], _json: json }) as unknown as Profile;

  const setup = (existingByEmail: User | null = null, boundUserId: number | null = null) => {
    const users = {
      findOne: jest.fn(async (query: Record<string, unknown>) =>
        'email' in query ? existingByEmail : ({ id: query.id } as User),
      ),
      createOne: jest.fn(async () => ({ id: 50 }) as User),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
    };
    const auth = { findUserIdBySSO: jest.fn().mockResolvedValue(boundUserId), addAuthenticationDetails: jest.fn() };
    return { users, auth, strategy: fixture.createStrategy({}, users, auth) };
  };

  it.each([false, 'false', 'FALSE'])('does not match by email when email_verified is %p', async (value) => {
    const { users, strategy } = setup();
    await strategy.validateProfile('issuer', profile({ email_verified: value }));
    expect(users.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ isEmailVerified: false }),
      expect.anything(),
    );
  });

  it.each([false, 'false'])('rejects with SSO_EMAIL_NOT_VERIFIED instead of linking (%p)', async (value) => {
    const { users, auth, strategy } = setup({ id: 9 } as User);
    const error = await strategy
      .validateProfile('issuer', profile({ email_verified: value }))
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ message: 'SSO_EMAIL_NOT_VERIFIED', status: 401 });
    expect(error).not.toBeInstanceOf(AccountLinkingRequiredException);
    expect(users.createOne).not.toHaveBeenCalled();
    expect(auth.addAuthenticationDetails).not.toHaveBeenCalled();
  });

  it('reads email_verified from the id token claims too', async () => {
    const { strategy } = setup({ id: 9 } as User);
    await expect(strategy.validateProfile('issuer', profile(), undefined, { email_verified: false })).rejects.toThrow(
      'SSO_EMAIL_NOT_VERIFIED',
    );
  });

  it.each([false, 'false'])('reads email_verified from the separate userinfo response (%p)', async (value) => {
    const { users, strategy } = setup();
    const bare = { id: 'subject', emails: [{ value: 'user@example.com' }] } as unknown as Profile;
    await strategy.validateProfile('issuer', bare, undefined, undefined, { email_verified: value });
    expect(users.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ isEmailVerified: false }),
      expect.anything(),
    );
    const taken = setup({ id: 9 } as User);
    await expect(
      taken.strategy.validateProfile('issuer', bare, undefined, undefined, { email_verified: value }),
    ).rejects.toThrow('SSO_EMAIL_NOT_VERIFIED');
  });

  it.each([true, 'true', undefined, 'maybe'])(
    'keeps linking and trusting behaviour when email_verified is %p',
    async (value) => {
      const linking = setup({ id: 9 } as User);
      await expect(
        linking.strategy.validateProfile('issuer', profile({ email_verified: value })),
      ).rejects.toBeInstanceOf(AccountLinkingRequiredException);

      const creating = setup();
      await creating.strategy.validateProfile('issuer', profile({ email_verified: value }));
      expect(creating.users.createOne).toHaveBeenCalledWith(
        expect.objectContaining({ isEmailVerified: true }),
        expect.anything(),
      );
    },
  );

  it('still logs in an existing bound user whose email is unverified', async () => {
    const { users, strategy } = setup(null, 7);
    const user = await strategy.validateProfile('issuer', profile({ email_verified: false }));
    expect(user).toMatchObject({ id: 7 });
    expect(users.createOne).not.toHaveBeenCalled();
  });
});
