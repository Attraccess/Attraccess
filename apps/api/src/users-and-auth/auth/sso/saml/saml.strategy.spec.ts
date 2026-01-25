import { Profile as SamlProfile } from '@node-saml/passport-saml';
import { ModuleRef } from '@nestjs/core';
import { SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { SSOSamlStrategy } from './saml.strategy';
import { SSOSamlRequest } from './saml.types';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';

describe('SSOSamlStrategy', () => {
  const buildRequest = (providerId: number, emailKey: string): SSOSamlRequest => {
    const samlConfiguration = {
      entryPoint: 'https://idp.example.com/sso',
      issuer: 'https://sp.example.com',
      certificate: 'CERTIFICATE',
      signRequest: false,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: true,
      forceAuthn: false,
      emailAttributeKeys: [emailKey],
      ssoProviderId: providerId,
    } as SSOProviderSAMLConfiguration;

    return {
      ssoSamlOptions: {
        providerId,
        samlConfiguration,
        callbackUrl: `https://api.example.com/auth/sso/SAML/${providerId}/callback`,
      },
    } as SSOSamlRequest;
  };

  it('uses per-request SAML configuration for parallel validations', async () => {
    const usersService = {
      findOne: jest.fn(),
    };
    usersService.findOne.mockImplementation((query: Record<string, unknown>) => {
      if ('externalIdentifier' in query) {
        return Promise.resolve(null);
      }
      if ('email' in query) {
        return Promise.resolve({
          id: 99,
          authenticationDetails: [{ id: 1 }],
        });
      }
      return Promise.resolve(null);
    });

    const moduleRef = {
      get: jest.fn().mockResolvedValue(usersService),
    } as unknown as ModuleRef;

    const strategy = new SSOSamlStrategy(moduleRef);

    const requestA = buildRequest(10, 'emailA');
    const requestB = buildRequest(20, 'emailB');

    const profileA = {
      nameID: 'user-a',
      issuer: 'https://issuer-a.example.com',
      nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      emailA: 'a@example.com',
    } as SamlProfile;
    const profileB = {
      nameID: 'user-b',
      issuer: 'https://issuer-b.example.com',
      nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      emailB: 'b@example.com',
    } as SamlProfile;

    const [resultA, resultB] = await Promise.allSettled([
      strategy.validate(requestA, profileA),
      strategy.validate(requestB, profileB),
    ]);

    expect(resultA.status).toBe('rejected');
    expect(resultB.status).toBe('rejected');

    const errorA = (resultA as PromiseRejectedResult).reason as AccountLinkingRequiredException;
    const errorB = (resultB as PromiseRejectedResult).reason as AccountLinkingRequiredException;

    expect(errorA).toBeInstanceOf(AccountLinkingRequiredException);
    expect(errorA.providerId).toBe(10);
    expect(errorA.email).toBe('a@example.com');

    expect(errorB).toBeInstanceOf(AccountLinkingRequiredException);
    expect(errorB.providerId).toBe(20);
    expect(errorB.email).toBe('b@example.com');
  });
});
