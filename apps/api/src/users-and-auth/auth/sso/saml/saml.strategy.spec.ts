import { EncryptionService } from '../../../../encryption/encryption.service';
import { PassportSamlConfig } from '@node-saml/passport-saml';
import { ModuleRef } from '@nestjs/core';
import { SSOProvider, SSOProviderSAMLConfiguration, SSOProviderType } from '@attraccess/database-entities';
import { SSOSamlStrategy } from './saml.strategy';
import { SSOSamlRequest } from './saml.types';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { SSOService } from '../sso.service';
import { SsoAuditService } from '../../../../audit/sso-audit.service';

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

  it.each([
    { custom: 'preferred@example.com', email: 'base@example.com' },
    { custom: ['preferred@example.com'], email: 'base@example.com' },
    { custom: 12, emails: ['preferred@example.com'] },
    { attributes: { custom: 'preferred@example.com' } },
    { attributes: { custom: ['preferred@example.com'] } },
  ])('resolves SAML email shapes without losing custom attribute precedence: %j', async (attributes) => {
    const usersService = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 9, authenticationDetails: [{}] }),
    };
    const strategy = new SSOSamlStrategy({ get: () => usersService } as unknown as ModuleRef);
    const request = buildRequest(10, 'custom');
    request.ssoSamlOptions.samlConfiguration.emailAttributeKeys = ['', 'custom'];
    await expect(strategy.validate(request, { nameID: 'subject', ...attributes } as SamlProfile)).rejects.toMatchObject(
      { email: 'preferred@example.com' },
    );
    expect(usersService.findOne).toHaveBeenLastCalledWith({ email: 'preferred@example.com' }, [
      'authenticationDetails',
    ]);
  });

  it('rejects assertions without any usable email before looking up an account', async () => {
    const usersService = { findOne: jest.fn() };
    const strategy = new SSOSamlStrategy({ get: () => usersService } as unknown as ModuleRef);
    await expect(
      strategy.validate(buildRequest(10, 'custom'), {
        nameID: 'subject',
        emails: [],
        attributes: { custom: 12 },
      } as SamlProfile),
    ).rejects.toThrow('No email found');
    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it.each(['available', 'missing', 'throws'] as const)(
    'builds per-request passport signing configuration when encryption is %s',
    (availability) => {
      const decrypt = jest.fn((value: string) => {
        expect(value).toBe('ciphertext');
        if (availability === 'throws') throw new Error('key unavailable');
        return 'private-key';
      });
      const moduleRef = {
        get: jest.fn((token: unknown) =>
          token === EncryptionService && availability !== 'missing' ? { decrypt } : undefined,
        ),
      } as unknown as ModuleRef;
      const strategy = new SSOSamlStrategy(moduleRef);
      const request = buildRequest(10, 'email');
      Object.assign(request.ssoSamlOptions.samlConfiguration, {
        signRequest: true,
        spSigningKeyEncrypted: 'ciphertext',
        spSigningCertificate: 'SIGNINGCERT',
        audience: 'audience',
      });
      const callback = jest.fn();
      // Exercise the request callback registered with Passport, without sending an IdP request.
      const passport = strategy as unknown as {
        _options: {
          getSamlOptions: (
            req: SSOSamlRequest,
            done: (error: Error | null, config?: PassportSamlConfig) => void,
          ) => void;
        };
      };
      passport._options.getSamlOptions(request, callback);
      expect(callback).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          issuer: 'https://sp.example.com',
          audience: 'audience',
          callbackUrl: request.ssoSamlOptions.callbackUrl,
          idpCert: '-----BEGIN CERTIFICATE-----\nCERTIFICATE\n-----END CERTIFICATE-----',
          privateKey: availability === 'available' ? 'private-key' : undefined,
        }),
      );
    },
  );

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
      get: jest.fn().mockImplementation((token: unknown) => (token === RbacService ? null : usersService)),
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

  it('audits successful SAML user creation and the committed role delta', async () => {
    const usersService = {
      findOne: jest.fn().mockResolvedValue(null),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
      createOne: jest.fn().mockResolvedValue({ id: 101, username: 'User', email: 'user@example.com' }),
    };
    const rbacService = {
      syncSsoRoles: jest.fn().mockResolvedValue({ added: ['user-manager'], removed: [], updated: [] }),
    };
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const provider = {
      id: 30,
      name: 'Workforce',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://app.example.com',
        audience: null,
        signRequest: false,
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: true,
        forceAuthn: false,
        emailAttributeKeys: ['email'],
        roleMappings: { 'user-manager': ['admins'] },
      },
    } as unknown as SSOProvider;
    const moduleRef = {
      get: jest.fn((token: unknown) =>
        token === UsersService
          ? usersService
          : token === RbacService
            ? rbacService
            : token === SSOService
              ? { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) }
              : token === SsoAuditService
                ? audit
                : undefined,
      ),
    } as unknown as ModuleRef;
    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(30, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = { 'user-manager': ['admins'] };

    await strategy.validate(request, {
      nameID: 'subject',
      email: 'user@example.com',
      groups: ['admins'],
    } as SamlProfile);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sso.provisioning.user_created', subject: { type: 'user', id: 101 } }),
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

  it('records a created user even when a later role sync fails', async () => {
    const usersService = {
      findOne: jest.fn().mockResolvedValue(null),
      buildUsernameFromSSOClaim: jest.fn((value: string) => value),
      createOne: jest.fn().mockResolvedValue({ id: 101, username: 'User', email: 'user@example.com' }),
    };
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const provider = {
      id: 30,
      name: 'Workforce',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://app.example.com',
        audience: null,
        signRequest: false,
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: true,
        forceAuthn: false,
        emailAttributeKeys: ['email'],
        roleMappings: { 'user-manager': ['admins'] },
      },
    } as unknown as SSOProvider;
    const moduleRef = {
      get: jest.fn((token: unknown) =>
        token === UsersService
          ? usersService
          : token === RbacService
            ? { syncSsoRoles: jest.fn().mockRejectedValue(new Error('role write failed')) }
            : token === SSOService
              ? { getProviderByTypeAndIdWithConfiguration: jest.fn().mockResolvedValue(provider) }
              : token === SsoAuditService
                ? audit
                : undefined,
      ),
    } as unknown as ModuleRef;
    const strategy = new SSOSamlStrategy(moduleRef);
    const request = buildRequest(30, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = { 'user-manager': ['admins'] };

    await expect(
      strategy.validate(request, { nameID: 'subject', email: 'user@example.com', groups: ['admins'] } as SamlProfile),
    ).rejects.toThrow('role write failed');

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sso.provisioning.user_created', subject: { type: 'user', id: 101 } }),
    );
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

  it('revokes previously granted SSO roles after the mapping has been cleared', async () => {
    const rbacService = { syncSsoRoles: jest.fn().mockResolvedValue(undefined) };

    const usersService = {
      findOne: jest.fn().mockImplementation((query: Record<string, unknown>) => {
        if ('externalIdentifier' in query) {
          return Promise.resolve({ id: 45, externalIdentifier: 'saml-user' });
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
    const request = buildRequest(31, 'email');
    // Admin emptied the mapping table → stored config is {} — sync must still run so roles
    // granted under the old mapping get revoked at next login.
    request.ssoSamlOptions.samlConfiguration.roleMappings = {};

    const profile = {
      nameID: 'saml-user',
      email: 'user@example.com',
      attributes: { roles: ['attraccess_admin'] },
    } as SamlProfile;

    await strategy.validate(request, profile);

    expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(45, [], SSOProviderType.SAML, 31);
  });
});
