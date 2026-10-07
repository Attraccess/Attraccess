import { type SamlProfile, registerSsosamlStrategyFixture } from './saml.strategy.ssosaml-strategy.test-fixture';
import { ModuleRef } from '@nestjs/core';
import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { SSOSamlStrategy } from './saml.strategy';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { SSOService } from '../sso.service';
import { SsoAuditService } from '../../../../audit/sso-audit.service';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { PassportSamlConfig } from '@node-saml/passport-saml';
import { SSOSamlRequest } from './saml.types';

export function registerAuditsSuccessfulSamlUserCreationAndTheCommittedRoleDeltaCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(30, 'email');
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
}

export function registerBuildsPerRequestPassportSigningConfigurationWhenEncryptionIsSCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
      const request = fixture.buildRequest(10, 'email');
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
}

export function registerDoesNotSyncRolesWhenProfileHasNoRoleGroupAttributesOnlyEmailNameEtcCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(30, 'email');
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
}

export function registerNormalizesSamlDisplayNamesForNewUsersCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(30, 'email');
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
}
