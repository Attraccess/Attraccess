import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';
import { UserEmailInvalidVerificationTokenException } from './auth.service';
import { AuthenticationType, SSOProviderType } from '@attraccess/application-models';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

const accountOf = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    isEmailVerified: true,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as never;

describe('AuthService', () => {
  const fixture = registerAuthServiceFixture();

  it('stores local password hashes and SSO subjects in the selected transaction', async () => {
    const local = await fixture.authService.addAuthenticationDetails(7, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'secret' },
    });
    expect(local).toEqual({ id: 1, userId: 7, type: AuthenticationType.LOCAL_PASSWORD });
    expect(bcrypt.hash).toHaveBeenCalledWith('secret', expect.any(Number));
    expect(fixture.credentials.add).toHaveBeenLastCalledWith(
      7,
      { type: AuthenticationType.LOCAL_PASSWORD, passwordHash: 'hashed-password' },
      undefined,
    );
    const transaction = { tag: 'transaction' };
    const sso = await fixture.authService.addAuthenticationDetails(
      7,
      {
        type: AuthenticationType.SSO,
        details: { providerType: SSOProviderType.SAML, providerId: 3, subject: 'external-subject' },
      },
      transaction,
    );
    expect(sso).toEqual({ id: 1, userId: 7, type: AuthenticationType.SSO });
    expect(fixture.credentials.add).toHaveBeenLastCalledWith(
      7,
      { type: AuthenticationType.SSO, providerType: SSOProviderType.SAML, providerId: 3, subject: 'external-subject' },
      transaction,
    );
    (bcrypt.hash as jest.Mock).mockClear();
    await fixture.authService.addAuthenticationDetails(
      7,
      { type: AuthenticationType.LOCAL_PASSWORD, details: { password: 'unused' } },
      transaction,
      'prepared-hash',
    );
    expect(fixture.credentials.add).toHaveBeenLastCalledWith(
      7,
      { type: AuthenticationType.LOCAL_PASSWORD, passwordHash: 'prepared-hash' },
      transaction,
    );
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it.each(['hashed:token', 'token'])(
    'consumes valid current and legacy email verification tokens: %s',
    async (stored) => {
      jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
        id: 7,
        emailVerificationToken: stored,
        emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
      } as never);
      await fixture.authService.verifyEmail('user@example.com', 'token');
      expect(fixture.usersService.consumeEmailVerificationToken).toHaveBeenCalledWith(7, stored);
    },
  );

  it('rejects a verification token that a concurrent request consumed first', async () => {
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'hashed:token',
      emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
    } as never);
    jest.spyOn(fixture.usersService, 'consumeEmailVerificationToken').mockResolvedValue(false);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toBeInstanceOf(
      UserEmailInvalidVerificationTokenException,
    );
  });

  it('rejects missing users, invalid tokens and expired verification links without modifying the account', async () => {
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue(null);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'other',
      emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
    } as never);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'hashed:token',
      emailVerificationTokenExpiresAt: new Date(0),
    } as never);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    expect(fixture.usersService.consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(fixture.authService).toBeDefined();
  });

  it('should authenticate user with correct credentials', async () => {
    const user = accountOf();
    jest.spyOn(fixture.usersService, 'findByLoginIdentifier').mockResolvedValue(user);
    fixture.credentials.findLocalPasswordHash.mockResolvedValue('hashed-password');

    // Mock bcrypt.compare to return true for correct password
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const isAuthenticated = await fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails('testuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'correct-password' },
    });

    expect(isAuthenticated).toBe(user);
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
    expect(fixture.credentials.findLocalPasswordHash).toHaveBeenCalledWith(1);
  });

  it('should not authenticate user with incorrect credentials', async () => {
    jest.spyOn(fixture.usersService, 'findByLoginIdentifier').mockResolvedValue(accountOf());
    fixture.credentials.findLocalPasswordHash.mockResolvedValue('hashed-password');

    // Mock bcrypt.compare to return false for incorrect password
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const isAuthenticated = await fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails('testuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'wrong-password' },
    });

    expect(isAuthenticated).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong-password', 'hashed-password');
    expect(fixture.mockMetricsService.authLoginTotal.inc).toHaveBeenCalledWith({ method: 'local', status: 'fail' });
  });

  it('should not authenticate a user without a local password', async () => {
    jest.spyOn(fixture.usersService, 'findByLoginIdentifier').mockResolvedValue(accountOf());
    fixture.credentials.findLocalPasswordHash.mockResolvedValue(null);

    await expect(
      fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails('testuser', {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'anything' },
      }),
    ).resolves.toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('refuses a local password login for a user that signs in with SSO', async () => {
    fixture.credentials.findLocalPasswordHash.mockResolvedValue('hashed-password');
    jest.spyOn(fixture.usersService, 'isSSOUser').mockResolvedValue(true);

    await expect(
      fixture.authService.validateAuthenticationDetails(1, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'x' },
      }),
    ).rejects.toThrow('LOCAL_LOGIN_FOR_SSO_FORBIDDEN');
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('should not authenticate a non-existent user', async () => {
    jest.spyOn(fixture.usersService, 'findByLoginIdentifier').mockResolvedValue(null);

    const isAuthenticated = await fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails(
      'nonexistentuser',
      {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'password' },
      },
    );

    expect(isAuthenticated).toBeNull();
    // A login attempt for an unknown username is the dominant brute-force vector
    // and must be counted as a failed login so the HighFailedLoginRate alert fires.
    expect(fixture.mockMetricsService.authLoginTotal.inc).toHaveBeenCalledWith({ method: 'local', status: 'fail' });
  });

  it.each([true, false])('checks the password before rejecting unverified email (valid=%s)', async (valid) => {
    jest
      .spyOn(fixture.usersService, 'findByLoginIdentifier')
      .mockResolvedValue({ id: 1, isEmailVerified: false } as never);
    fixture.credentials.findLocalPasswordHash.mockResolvedValue('hash');
    (bcrypt.compare as jest.Mock).mockResolvedValue(valid);
    const result = fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails('user@example.com', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: ' password ' },
    });
    if (valid) await expect(result).rejects.toThrow('UserEmailNotVerifiedException');
    else await expect(result).resolves.toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith(' password ', 'hash');
    expect(fixture.usersService.findByLoginIdentifier).toHaveBeenCalledWith('user@example.com');
  });

  describe('SSO credentials', () => {
    it('matches the provider, the provider id and the subject', async () => {
      fixture.credentials.findSso.mockResolvedValue({
        id: 5,
        userId: 1,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 10,
        ssoSubject: 'sub-abc',
      });
      const options = (subject: string, providerId = 10) => ({
        type: AuthenticationType.SSO as const,
        details: { providerType: SSOProviderType.OIDC, providerId, subject },
      });

      await expect(fixture.authService.validateAuthenticationDetails(1, options('sub-abc'))).resolves.toBe(true);
      await expect(fixture.authService.validateAuthenticationDetails(1, options('other'))).resolves.toBe(false);
      await expect(fixture.authService.validateAuthenticationDetails(1, options('sub-abc', 11))).resolves.toBe(false);
    });

    it('does not validate a user without an SSO credential', async () => {
      fixture.credentials.findSso.mockResolvedValue(null);
      await expect(
        fixture.authService.validateAuthenticationDetails(1, {
          type: AuthenticationType.SSO,
          details: { providerType: SSOProviderType.OIDC, providerId: 10, subject: 's' },
        }),
      ).resolves.toBe(false);
    });
  });

  describe('findSSOAuthenticationDetail', () => {
    it('returns the SSO detail when one exists for the user', async () => {
      const ssoDetail = {
        id: 5,
        userId: 1,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 10,
        ssoSubject: 'sub-abc',
      };

      fixture.credentials.findSso.mockResolvedValue(ssoDetail);

      const result = await fixture.authService.findSSOAuthenticationDetail(1);

      expect(result).toEqual(ssoDetail);
      expect(fixture.credentials.findSso).toHaveBeenCalledWith(1);
    });

    it('returns null when no SSO detail exists for the user', async () => {
      fixture.credentials.findSso.mockResolvedValue(null);

      const result = await fixture.authService.findSSOAuthenticationDetail(99);

      expect(result).toBeNull();
    });
  });

  describe('updateSSOSubject', () => {
    it('updates the ssoSubject on the given detail row', async () => {
      await fixture.authService.updateSSOSubject(5, 'new-sub-xyz');

      expect(fixture.credentials.updateSsoSubject).toHaveBeenCalledWith(5, 'new-sub-xyz');
    });
  });

  describe('userHasSSOAuthentication', () => {
    it('returns true when user has an SSO authentication detail', async () => {
      fixture.credentials.findSso.mockResolvedValue({ id: 1, userId: 1, type: AuthenticationType.SSO });

      expect(await fixture.authService.userHasSSOAuthentication(1)).toBe(true);
    });

    it('returns false when user has no SSO authentication detail', async () => {
      fixture.credentials.findSso.mockResolvedValue(null);

      expect(await fixture.authService.userHasSSOAuthentication(1)).toBe(false);
    });
  });

  describe('changePassword', () => {
    const recipient = { id: 7, username: 'user', email: 'user@example.com', locale: 'en' };

    it('replaces the password and archives the old one in a single store call, then notifies the user', async () => {
      fixture.passwordPolicy.getPolicy.mockResolvedValue({ historySize: 5 });

      await fixture.authService.changePassword(recipient, 'new-secret');

      expect(fixture.credentials.replaceLocalPassword).toHaveBeenCalledTimes(1);
      expect(fixture.credentials.replaceLocalPassword).toHaveBeenCalledWith(7, 'hashed-password', {
        rememberPrevious: 5,
      });
      expect(fixture.emailService.sendPasswordChangedEmail).toHaveBeenCalledWith(recipient);
    });

    it('sends no notification and changes nothing when the store fails', async () => {
      fixture.credentials.replaceLocalPassword.mockRejectedValue(new Error('database failure'));

      await expect(fixture.authService.changePassword(recipient, 'new-secret')).rejects.toThrow('database failure');
      expect(fixture.emailService.sendPasswordChangedEmail).not.toHaveBeenCalled();
    });

    it('refuses the password change of an SSO user', async () => {
      jest.spyOn(fixture.usersService, 'isSSOUser').mockResolvedValue(true);

      await expect(fixture.authService.changePassword(recipient, 'new-secret')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fixture.credentials.replaceLocalPassword).not.toHaveBeenCalled();
    });
  });

  describe('removal', () => {
    it('removes the local password or a credential by id', async () => {
      await fixture.authService.removeLocalPasswordAuthentication(4);
      await fixture.authService.removeAuthenticationDetails(8);
      expect(fixture.credentials.removeLocalPassword).toHaveBeenCalledWith(4);
      expect(fixture.credentials.remove).toHaveBeenCalledWith(8);
    });
  });
});
