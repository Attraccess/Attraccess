import { ModuleRef } from '@nestjs/core';
import { SSOProviderSAMLConfiguration, SSOProviderType } from '@attraccess/database-entities';
import { SSOSamlStrategy } from './saml.strategy';
import { SSOSamlRequest } from './saml.types';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { RbacService } from '../../../rbac/rbac.service';

type SamlProfile = Record<string, unknown>;

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

  it('normalizes SAML display names for new users', async () => {
    const usersService = {
      findOne: jest.fn(async () => null),
      buildUsernameFromSSOClaim: jest.fn(() => 'name.surname'),
      createOne: jest.fn(
        async ({ username, email, externalIdentifier }) =>
          ({
            id: 101,
            username,
            email,
            externalIdentifier,
          }) as unknown as { id: number; username: string; email: string; externalIdentifier: string },
      ),
    };
    const moduleRef = {
      get: jest.fn().mockImplementation((token: unknown) =>
        token === RbacService ? null : usersService,
      ),
    } as unknown as ModuleRef;

    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(30, 'email');
    const profile = {
      nameID: 'user-1',
      issuer: 'https://issuer.example.com',
      nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      email: 'user@example.com',
      displayName: 'Name Surname',
    } as SamlProfile;

    const user = await strategy.validate(request, profile);

    expect(usersService.buildUsernameFromSSOClaim).toHaveBeenCalledWith('Name Surname', 'user@example.com');
    expect(usersService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'name.surname',
        email: 'user@example.com',
        externalIdentifier: 'user-1',
        isEmailVerified: true,
      }),
    );
    expect(user.username).toBe('name.surname');
  });

  it('does not sync roles when profile has no role/group attributes (only email, name, etc.)', async () => {
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };
    const usersService = {
      findOne: jest.fn().mockImplementation((query: Record<string, unknown>) => {
        if ('externalIdentifier' in query) return Promise.resolve({ id: 44, externalIdentifier: 'saml-user' });
        return Promise.resolve(null);
      }),
      updateOne: jest.fn(),
    };
    const moduleRef = {
      get: jest.fn((token: unknown) => (token === RbacService ? rbacService : usersService)),
    } as unknown as ModuleRef;

    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(30, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = { 'user-manager': ['attraccess_admin'] };

    const profile = {
      nameID: 'saml-user',
      email: 'user@example.com',
      // attributes contains only non-role fields — the old bug would have treated email/displayName as role names
      attributes: { email: 'user@example.com', displayName: 'Test User' },
    } as SamlProfile;

    await strategy.validate(request, profile);

    expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
  });

  it('syncs RBAC roles from Azure AD URI-style group claims and memberOf', async () => {
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };
    const usersService = {
      findOne: jest.fn().mockImplementation((query: Record<string, unknown>) => {
        if ('externalIdentifier' in query) {
          return Promise.resolve({ id: 55, externalIdentifier: 'ad-user' });
        }
        return Promise.resolve(null);
      }),
      updateOne: jest.fn(),
    };
    const moduleRef = {
      get: jest.fn((token: unknown) => (token === RbacService ? rbacService : usersService)),
    } as unknown as ModuleRef;

    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(40, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = {
      'user-manager': ['attraccess_admin'],
    };

    const profile = {
      nameID: 'ad-user',
      email: 'aduser@corp.example.com',
      attributes: {
        // Azure AD URI-style group claim — should be matched
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups': ['attraccess_admin'],
      },
    } as SamlProfile;

    await strategy.validate(request, profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
      55,
      expect.arrayContaining([expect.objectContaining({ roleKey: 'user-manager' })]),
      SSOProviderType.SAML,
      40,
    );
  });

  it('syncs RBAC roles from SAML role attributes', async () => {
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const usersService = {
      findOne: jest.fn().mockImplementation((query: Record<string, unknown>) => {
        if ('externalIdentifier' in query) {
          return Promise.resolve({ id: 44, externalIdentifier: 'saml-user' });
        }
        return Promise.resolve(null);
      }),
      updateOne: jest.fn(),
    };

    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === RbacService) return rbacService;
        return usersService;
      }),
    } as unknown as ModuleRef;

    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(30, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = {
      'user-manager': ['attraccess_admin'],
      'billing-manager': ['billing-role'],
    };

    const profile = {
      nameID: 'saml-user',
      email: 'user@example.com',
      attributes: {
        roles: ['attraccess_admin', 'billing-role'],
      },
    } as SamlProfile;

    await strategy.validate(request, profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
      44,
      expect.arrayContaining([
        expect.objectContaining({ roleKey: 'user-manager' }),
        expect.objectContaining({ roleKey: 'billing-manager' }),
      ]),
      SSOProviderType.SAML,
      30,
    );
  });

  it('revokes provider roles when a role attribute is present but empty', async () => {
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const usersService = {
      findOne: jest.fn().mockImplementation((query: Record<string, unknown>) => {
        if ('externalIdentifier' in query) {
          return Promise.resolve({ id: 44, externalIdentifier: 'saml-user' });
        }
        return Promise.resolve(null);
      }),
      updateOne: jest.fn(),
    };

    const moduleRef = {
      get: jest.fn((token: unknown) => {
        if (token === RbacService) return rbacService;
        return usersService;
      }),
    } as unknown as ModuleRef;

    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(30, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = { 'user-manager': ['attraccess_admin'] };

    const profile = {
      nameID: 'saml-user',
      email: 'user@example.com',
      // roles attribute present but empty → authoritative, revoke this provider's SSO roles
      attributes: { roles: [] },
    } as SamlProfile;

    await strategy.validate(request, profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(44, [], SSOProviderType.SAML, 30);
  });
});
