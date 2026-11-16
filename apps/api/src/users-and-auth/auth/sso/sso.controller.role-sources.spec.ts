import { ForbiddenException } from '@nestjs/common';
import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';

// Role claim paths (OIDC) and role attribute keys (SAML) decide where roles come from, so changing them
// requires users.roles.manage on top of system.sso.manage.
describe('SsoController role source permissions', () => {
  const fixture = registerSsoControllerFixture();

  it('gates changing role claim paths and attribute keys behind users.roles.manage', async () => {
    const noPermission = {
      user: { id: 1, effectivePermissions: new Set<string>() },
    } as unknown as AuthenticatedRequest;

    await expect(
      fixture.controller.updateOne(
        '1',
        { oidcConfiguration: { roleClaimPaths: ['custom.roles'] } } as UpdateSSOProviderDto,
        noPermission,
      ),
    ).rejects.toThrow(ForbiddenException);

    jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(fixture.mockSamlProvider);
    await expect(
      fixture.controller.updateOne(
        '2',
        { samlConfiguration: { roleAttributeKeys: ['custom-roles'] } } as UpdateSSOProviderDto,
        noPermission,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      fixture.controller.createOne(
        {
          name: 'New',
          type: SSOProviderType.OIDC,
          oidcConfiguration: { roleClaimPaths: ['custom.roles'] },
        } as CreateSSOProviderDto,
        noPermission,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(fixture.ssoService.updateProvider).not.toHaveBeenCalled();
  });

  it('does not require users.roles.manage when role claim paths are unchanged or omitted', async () => {
    const noPermission = {
      user: { id: 1, effectivePermissions: new Set<string>() },
    } as unknown as AuthenticatedRequest;
    jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValue({
      ...fixture.mockSSOProvider,
      oidcConfiguration: {
        ...fixture.mockSSOProvider.oidcConfiguration,
        roleClaimPaths: ['custom.roles'],
      },
    } as SSOProvider);

    // re-sent unchanged
    await expect(
      fixture.controller.updateOne(
        '1',
        { oidcConfiguration: { roleClaimPaths: ['custom.roles'] } } as UpdateSSOProviderDto,
        noPermission,
      ),
    ).resolves.toBeDefined();
    // omitted
    await expect(fixture.controller.updateOne('1', { name: 'Renamed' }, noPermission)).resolves.toBeDefined();
    // clearing is a change
    await expect(
      fixture.controller.updateOne(
        '1',
        { oidcConfiguration: { roleClaimPaths: null } } as unknown as UpdateSSOProviderDto,
        noPermission,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('compares role claim paths entry by entry so a merged list is a change', async () => {
    const noPermission = {
      user: { id: 1, effectivePermissions: new Set<string>() },
    } as unknown as AuthenticatedRequest;
    jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValue({
      ...fixture.mockSSOProvider,
      oidcConfiguration: {
        ...fixture.mockSSOProvider.oidcConfiguration,
        roleClaimPaths: ['groups', 'realm_access.roles'],
      },
    } as SSOProvider);

    await expect(
      fixture.controller.updateOne(
        '1',
        { oidcConfiguration: { roleClaimPaths: ['groups\nrealm_access.roles'] } } as UpdateSSOProviderDto,
        noPermission,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(fixture.ssoService.updateProvider).not.toHaveBeenCalled();
  });

  it('names the SAML setting in the role attribute keys permission error', async () => {
    const noPermission = {
      user: { id: 1, effectivePermissions: new Set<string>() },
    } as unknown as AuthenticatedRequest;
    jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(fixture.mockSamlProvider);

    await expect(
      fixture.controller.updateOne(
        '2',
        { samlConfiguration: { roleAttributeKeys: ['custom-roles'] } } as UpdateSSOProviderDto,
        noPermission,
      ),
    ).rejects.toThrow('Configuring SSO role attribute keys requires users.roles.manage');
  });
});
