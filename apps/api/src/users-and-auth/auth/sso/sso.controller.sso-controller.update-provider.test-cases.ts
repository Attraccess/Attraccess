import { SSOProvider } from '@attraccess/database-entities';
import { ForbiddenException } from '@nestjs/common';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { RbacService } from '../../rbac/rbac.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
export function registerUpdateProviderCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('updateProvider', () => {
    it('should update a provider when user has permission', async () => {
      const updateDto: UpdateSSOProviderDto = {
        name: 'Updated Provider',
      };

      // Provider without permission mappings — no ceiling check triggered.
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce({
        ...fixture.mockSSOProvider,
        oidcConfiguration: { ...fixture.mockSSOProvider.oidcConfiguration, roleMappings: {} },
      } as SSOProvider);

      const mockReq = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;
      const result = await fixture.controller.updateOne('1', updateDto, mockReq);

      expect(result).toEqual(fixture.mockSSOProvider);
      expect(fixture.ssoService.updateProvider).toHaveBeenCalledWith(1, updateDto);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.updated',
          details: expect.objectContaining({ before: expect.any(String), after: expect.any(String) }),
        }),
      );
    });

    it('gates explicit null roleMappings behind users.roles.manage', async () => {
      const updateDto = {
        oidcConfiguration: { roleMappings: null },
      } as unknown as UpdateSSOProviderDto;

      const mockReq = { user: { id: 1, effectivePermissions: new Set<string>() } } as unknown as AuthenticatedRequest;

      await expect(fixture.controller.updateOne('1', updateDto, mockReq)).rejects.toThrow(ForbiddenException);
      expect(fixture.ssoService.updateProvider).not.toHaveBeenCalled();
    });

    it('does not audit a provider update that fails before commit', async () => {
      jest.spyOn(fixture.ssoService, 'updateProvider').mockRejectedValueOnce(new Error('configuration write failed'));
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await expect(fixture.controller.updateOne('1', { name: 'Updated Provider' }, request)).rejects.toThrow(
        'configuration write failed',
      );

      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();
    });

    it('suppresses a true no-op but records a safe secret rotation flag', async () => {
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await fixture.controller.updateOne('1', {}, request);
      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();

      await fixture.controller.updateOne(
        '1',
        {
          oidcConfiguration: { clientSecret: fixture.mockSSOProvider.oidcConfiguration?.clientSecret },
        } as UpdateSSOProviderDto,
        request,
      );
      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();

      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce({
        ...fixture.mockSSOProvider,
        oidcConfiguration: { ...fixture.mockSSOProvider.oidcConfiguration, clientSecret: 'replacement' },
      } as SSOProvider);
      await fixture.controller.updateOne(
        '1',
        { oidcConfiguration: { clientSecret: 'replacement' } } as UpdateSSOProviderDto,
        request,
      );
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provider.updated',
          details: expect.objectContaining({ changes: JSON.stringify({ changed: [], rotated: ['clientSecret'] }) }),
        }),
      );
    });

    it('does not report rotation when a SAML form resubmits its unchanged certificate', async () => {
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(fixture.mockSamlProvider);
      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce(fixture.mockSamlProvider);
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;
      await fixture.controller.updateOne(
        '2',
        {
          samlConfiguration: { certificate: fixture.mockSamlProvider.samlConfiguration?.certificate },
        } as UpdateSSOProviderDto,
        request,
      );
      expect(fixture.ssoAudit.record).not.toHaveBeenCalled();
    });

    it('uses the authoritative configuration to detect same-count mapping and query-only URL changes', async () => {
      const before = {
        ...fixture.mockSSOProvider,
        oidcConfiguration: {
          ...fixture.mockSSOProvider.oidcConfiguration,
          authorizationURL: 'https://test-issuer.com/auth?tenant=one',
          roleMappings: { 'user-manager': ['admins'] },
        },
      } as SSOProvider;
      const after = {
        ...before,
        oidcConfiguration: {
          ...before.oidcConfiguration,
          authorizationURL: 'https://test-issuer.com/auth?tenant=two',
          roleMappings: { 'billing-manager': ['billing'] },
        },
      } as SSOProvider;
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(before);
      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce(after);
      jest
        .spyOn(fixture.module.get(RbacService), 'getRoles')
        .mockResolvedValue([{ key: 'billing-manager', rolePermissions: [] }] as never);
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await fixture.controller.updateOne(
        '1',
        {
          oidcConfiguration: {
            authorizationURL: after.oidcConfiguration?.authorizationURL,
            roleMappings: after.oidcConfiguration?.roleMappings,
          },
        },
        request,
      );

      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            changes: JSON.stringify({
              changed: ['configuration.authorizationURL', 'configuration.roleMappings'],
              rotated: [],
            }),
          }),
        }),
      );
    });

    it('records certificate replacement as a rotation without retaining certificate material', async () => {
      const before = fixture.mockSamlProvider;
      const after = {
        ...before,
        samlConfiguration: { ...before.samlConfiguration, certificate: 'REPLACEMENT' },
      } as SSOProvider;
      jest.spyOn(fixture.ssoService, 'getProviderById').mockResolvedValueOnce(before);
      jest.spyOn(fixture.ssoService, 'updateProvider').mockResolvedValueOnce(after);
      const request = {
        user: { id: 1, effectivePermissions: new Set(['users.roles.manage']) },
      } as unknown as AuthenticatedRequest;

      await fixture.controller.updateOne(
        '2',
        { samlConfiguration: { certificate: 'REPLACEMENT' } } as UpdateSSOProviderDto,
        request,
      );

      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            changes: JSON.stringify({ changed: [], rotated: ['identityProviderCertificate'] }),
          }),
        }),
      );
    });
  });
}
