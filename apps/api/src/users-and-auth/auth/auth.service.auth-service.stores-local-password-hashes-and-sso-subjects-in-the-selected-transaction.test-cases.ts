import { AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import * as bcrypt from 'bcrypt';
import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerStoresLocalPasswordHashesAndSsoSubjectsInTheSelectedTransactionCases(
  fixture: ReturnType<typeof registerAuthServiceFixture>,
) {
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
}
