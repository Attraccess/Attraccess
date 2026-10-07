import { type SamlProfile, registerSsosamlStrategyFixture } from './saml.strategy.ssosaml-strategy.test-fixture';
import { ModuleRef } from '@nestjs/core';
import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { SSOSamlStrategy } from './saml.strategy';
import { RbacService } from '../../../rbac/rbac.service';
import { UsersService } from '../../../users/users.service';
import { SSOService } from '../sso.service';
import { SsoAuditService } from '../../../../audit/sso-audit.service';

export function registerRecordsACreatedUserEvenWhenALaterRoleSyncFailsCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(30, 'email');
    request.ssoSamlOptions.samlConfiguration.roleMappings = { 'user-manager': ['admins'] };

    await expect(
      strategy.validate(request, { nameID: 'subject', email: 'user@example.com', groups: ['admins'] } as SamlProfile),
    ).rejects.toThrow('role write failed');

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sso.provisioning.user_created', subject: { type: 'user', id: 101 } }),
    );
  });
}

export function registerRejectsAssertionsWithoutAnyUsableEmailBeforeLookingUpAnAccountCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
  it('rejects assertions without any usable email before looking up an account', async () => {
    const usersService = { findOne: jest.fn() };
    const strategy = new SSOSamlStrategy({ get: () => usersService } as unknown as ModuleRef);
    await expect(
      strategy.validate(fixture.buildRequest(10, 'custom'), {
        nameID: 'subject',
        emails: [],
        attributes: { custom: 12 },
      } as SamlProfile),
    ).rejects.toThrow('No email found');
    expect(usersService.findOne).not.toHaveBeenCalled();
  });
}

export function registerResolvesSamlEmailShapesWithoutLosingCustomAttributePrecedenceJCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(10, 'custom');
    request.ssoSamlOptions.samlConfiguration.emailAttributeKeys = ['', 'custom'];
    await expect(strategy.validate(request, { nameID: 'subject', ...attributes } as SamlProfile)).rejects.toMatchObject(
      { email: 'preferred@example.com' },
    );
    expect(usersService.findOne).toHaveBeenLastCalledWith({ email: 'preferred@example.com' }, [
      'authenticationDetails',
    ]);
  });
}

export function registerRevokesPreviouslyGrantedSsoRolesAfterTheMappingHasBeenClearedCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(31, 'email');
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
}

export function registerRevokesProviderRolesWhenARoleAttributeIsPresentButEmptyCases(
  fixture: ReturnType<typeof registerSsosamlStrategyFixture>,
) {
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
    const request = fixture.buildRequest(30, 'email');
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
}
