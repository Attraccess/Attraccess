import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';
import { User, AuthenticationDetail, AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import * as bcrypt from 'bcrypt';
import { UpdateResult } from 'typeorm';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
describe('AuthService', () => {
  const fixture = registerAuthServiceFixture();

  it('stores local password hashes and SSO subjects in the selected transaction', async () => {
    const local = await fixture.authService.addAuthenticationDetails(7, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'secret' },
    });
    expect(local).toMatchObject({ userId: 7, password: 'hashed-password', type: AuthenticationType.LOCAL_PASSWORD });
    expect(bcrypt.hash).toHaveBeenCalledWith('secret', expect.any(Number));
    const manager = { save: jest.fn(async (value) => value) };
    const sso = await fixture.authService.addAuthenticationDetails(
      7,
      {
        type: AuthenticationType.SSO,
        details: { providerType: SSOProviderType.SAML, providerId: 3, subject: 'external-subject' },
      },
      manager as never,
    );
    expect(sso).toMatchObject({
      userId: 7,
      providerId: 3,
      providerType: SSOProviderType.SAML,
      ssoSubject: 'external-subject',
    });
    (bcrypt.hash as jest.Mock).mockClear();
    const prehashed = await fixture.authService.addAuthenticationDetails(
      7,
      { type: AuthenticationType.LOCAL_PASSWORD, details: { password: 'unused' } },
      manager as never,
      'prepared-hash',
    );
    expect(prehashed.password).toBe('prepared-hash');
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it.each(['hashed:token', 'token'])(
    'consumes valid current and legacy email verification tokens: %s',
    async (stored) => {
      jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
        id: 7,
        emailVerificationToken: stored,
        emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
      } as User);
      await fixture.authService.verifyEmail('user@example.com', 'token');
      expect(fixture.usersService.updateOne).toHaveBeenCalledWith(7, {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      });
    },
  );

  it('rejects missing users, invalid tokens and expired verification links without modifying the account', async () => {
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue(null);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'other',
      emailVerificationTokenExpiresAt: new Date(Date.now() + 60000),
    } as User);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    jest.spyOn(fixture.usersService, 'findOne').mockResolvedValue({
      id: 7,
      emailVerificationToken: 'hashed:token',
      emailVerificationTokenExpiresAt: new Date(0),
    } as User);
    await expect(fixture.authService.verifyEmail('user@example.com', 'token')).rejects.toThrow();
    expect(fixture.usersService.updateOne).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(fixture.authService).toBeDefined();
  });

  it('should authenticate user with correct credentials', async () => {
    const user = {
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
      resourceIntroductions: [],
      resourceUsages: [],
      authenticationDetails: [],
      resourceIntroducerPermissions: [],
    } as User;
    jest.spyOn(fixture.usersService, 'findByLoginIdentifier').mockResolvedValue(user);

    const authenticationDetail: Partial<AuthenticationDetail> = {
      userId: 1,
      type: AuthenticationType.LOCAL_PASSWORD,
      password: 'hashed-password',
    };
    jest
      .spyOn(fixture.authenticationDetailRepository, 'findOne')
      .mockResolvedValue(authenticationDetail as AuthenticationDetail);

    // Mock bcrypt.compare to return true for correct password
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const isAuthenticated = await fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails('testuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'correct-password' },
    });

    expect(isAuthenticated).toBe(user);
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
  });

  it('should not authenticate user with incorrect credentials', async () => {
    const user = {
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
      resourceIntroductions: [],
      resourceUsages: [],
      authenticationDetails: [],
      resourceIntroducerPermissions: [],
    } as User;
    jest.spyOn(fixture.usersService, 'findByLoginIdentifier').mockResolvedValue(user);

    jest.spyOn(fixture.authenticationDetailRepository, 'findOne').mockResolvedValue({
      id: 1,
      userId: user.id,
      type: AuthenticationType.LOCAL_PASSWORD,
      password: 'hashed-password',
    } as AuthenticationDetail);

    // Mock bcrypt.compare to return false for incorrect password
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const isAuthenticated = await fixture.authService.getUserByLoginIdentifierAndAuthenticationDetails('testuser', {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: { password: 'wrong-password' },
    });

    expect(isAuthenticated).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong-password', 'hashed-password');
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
      .mockResolvedValue({ id: 1, isEmailVerified: false } as User);
    jest
      .spyOn(fixture.authenticationDetailRepository, 'findOne')
      .mockResolvedValue({ password: 'hash' } as AuthenticationDetail);
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

  describe('findSSOAuthenticationDetail', () => {
    it('returns the SSO detail when one exists for the user', async () => {
      const ssoDetail = {
        id: 5,
        userId: 1,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 10,
        ssoSubject: 'sub-abc',
      } as AuthenticationDetail;

      jest.spyOn(fixture.authenticationDetailRepository, 'findOne').mockResolvedValue(ssoDetail);

      const result = await fixture.authService.findSSOAuthenticationDetail(1);

      expect(result).toEqual(ssoDetail);
      expect(fixture.authenticationDetailRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 1, type: AuthenticationType.SSO },
      });
    });

    it('returns null when no SSO detail exists for the user', async () => {
      jest.spyOn(fixture.authenticationDetailRepository, 'findOne').mockResolvedValue(null);

      const result = await fixture.authService.findSSOAuthenticationDetail(99);

      expect(result).toBeNull();
    });
  });

  describe('updateSSOSubject', () => {
    it('updates the ssoSubject on the given detail row', async () => {
      jest.spyOn(fixture.authenticationDetailRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      await fixture.authService.updateSSOSubject(5, 'new-sub-xyz');

      expect(fixture.authenticationDetailRepository.update).toHaveBeenCalledWith(5, { ssoSubject: 'new-sub-xyz' });
    });
  });

  describe('userHasSSOAuthentication', () => {
    it('returns true when user has an SSO authentication detail', async () => {
      (fixture.authenticationDetailRepository.count as jest.Mock).mockResolvedValue(1);

      const result = await fixture.authService.userHasSSOAuthentication(1);

      expect(result).toBe(true);
    });

    it('returns false when user has no SSO authentication detail', async () => {
      (fixture.authenticationDetailRepository.count as jest.Mock).mockResolvedValue(0);

      const result = await fixture.authService.userHasSSOAuthentication(1);

      expect(result).toBe(false);
    });
  });
});
