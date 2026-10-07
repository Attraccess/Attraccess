import { SessionService } from '../session.service';
import { AuthenticationType, SSOProviderType } from '@attraccess/database-entities';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { Request } from 'express';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
export function registerSsoProvisioningEndpointsCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('sso provisioning endpoints', () => {
    it('resolves OIDC users by email only when they belong to the requested provider', async () => {
      const users = fixture.module.get<UsersService>(UsersService);
      const request = { headers: { authorization: 'Bearer test-client-secret' } } as unknown as Request;
      (users.findOne as jest.Mock).mockResolvedValue({
        id: 55,
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 1 }],
      });
      expect(await fixture.controller.oidcLogout('1', request, { email: ' user@example.com ' })).toEqual({ OK: true });
      expect(users.findOne).toHaveBeenCalledWith({ email: 'user@example.com' }, ['authenticationDetails']);
      (users.findOne as jest.Mock).mockResolvedValue({
        id: 55,
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 99 }],
      });
      await expect(fixture.controller.oidcLogout('1', request, { email: 'user@example.com' })).rejects.toThrow(
        'SSO_USER_NOT_FOUND',
      );
      await expect(fixture.controller.oidcLogout('1', request, { subject: ' ', email: ' ' })).rejects.toThrow(
        'SSO_SUBJECT_OR_EMAIL_REQUIRED',
      );
    });

    it('requires an external identity for SAML email fallback', async () => {
      const users = fixture.module.get<UsersService>(UsersService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValue(fixture.mockSamlProvider);
      const request = { headers: { authorization: 'Bearer saml-secret' } } as unknown as Request;
      (users.findOne as jest.Mock).mockResolvedValue({ id: 55, externalIdentifier: 'saml-subject' });
      expect(await fixture.controller.samlLogout('2', request, { email: 'user@example.com' })).toEqual({ OK: true });
      (users.findOne as jest.Mock).mockResolvedValue({ id: 55, externalIdentifier: null });
      await expect(fixture.controller.samlLogout('2', request, { email: 'user@example.com' })).rejects.toThrow(
        'SSO_USER_NOT_FOUND',
      );
    });

    it('revokes sessions for oidc logout requests', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const sessionService = fixture.module.get<SessionService>(SessionService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 55 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcLogout('1', mockRequest as unknown as Request, { subject: 'sub-1' });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(55);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.sessions_revoked',
          actorId: null,
          subject: { type: 'user', id: 55 },
        }),
      );
    });

    it('deletes users for oidc delete requests', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 77 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcDeleteUser('1', mockRequest as unknown as Request, {
        subject: 'sub-2',
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(77);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.user_deleted',
          actorId: null,
          subject: { type: 'user', id: 77 },
        }),
      );
    });

    it('does not sync RBAC roles when roles field is absent (incremental provisioning)', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const rbacService = fixture.module.get<RbacService>(RbacService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 88 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-3',
      });

      expect(result).toEqual({ OK: true });
      expect(rbacService.syncSsoRoles).not.toHaveBeenCalled();
    });

    it('maps role names using provider permission mappings', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const rbacService = fixture.module.get<RbacService>(RbacService);

      (usersService.findOneBySSO as jest.Mock).mockResolvedValue({ id: 99 });

      const mockRequest = {
        headers: { authorization: 'Bearer test-client-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.oidcUpdatePermissions('1', mockRequest as unknown as Request, {
        subject: 'sub-4',
        roles: ['attraccess_admin'],
      });

      expect(result).toEqual({ OK: true });
      // 'attraccess_admin' → 'user-manager' via provider's roleMappings
      expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
        99,
        expect.arrayContaining([expect.objectContaining({ roleKey: 'user-manager' })]),
        SSOProviderType.OIDC,
        1,
      );
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.permissions_synced',
          actorId: null,
          subject: { type: 'user', id: 99 },
          details: expect.objectContaining({
            changes: JSON.stringify({ added: ['user-manager'], removed: [], updated: [] }),
          }),
        }),
      );
    });

    it('handles SAML provisioning logout', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const sessionService = fixture.module.get<SessionService>(SessionService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValueOnce(fixture.mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 101,
        externalIdentifier: 'saml-user',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.samlLogout('2', mockRequest as unknown as Request, {
        subject: 'saml-user',
      });

      expect(result).toEqual({ OK: true });
      expect(sessionService.revokeAllUserSessions).toHaveBeenCalledWith(101);
      expect(fixture.ssoAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso.provisioning.sessions_revoked',
          actorId: null,
          subject: { type: 'user', id: 101 },
        }),
      );
    });

    it('handles SAML provisioning delete', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValueOnce(fixture.mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 102,
        externalIdentifier: 'saml-user-2',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.samlDeleteUser('2', mockRequest as unknown as Request, {
        subject: 'saml-user-2',
      });

      expect(result).toEqual({ OK: true });
      expect(usersService.deleteOne).toHaveBeenCalledWith(102);
    });

    it('handles SAML provisioning permission updates', async () => {
      const usersService = fixture.module.get<UsersService>(UsersService);
      const rbacService = fixture.module.get<RbacService>(RbacService);
      jest
        .spyOn(fixture.ssoService, 'getProviderByTypeAndIdWithConfiguration')
        .mockResolvedValueOnce(fixture.mockSamlProvider);

      (usersService.findOne as jest.Mock).mockResolvedValue({
        id: 103,
        externalIdentifier: 'saml-user-3',
        authenticationDetails: [],
      });

      const mockRequest = {
        headers: { authorization: 'Bearer saml-secret' },
      } as unknown as AuthenticatedRequest;

      const result = await fixture.controller.samlUpdatePermissions('2', mockRequest as unknown as Request, {
        subject: 'saml-user-3',
        roles: ['billing-role'],
      });

      expect(result).toEqual({ OK: true });
      // 'billing-role' → 'billing-manager' via SAML provider's roleMappings
      expect(rbacService.syncSsoRoles).toHaveBeenCalledWith(
        103,
        expect.arrayContaining([expect.objectContaining({ roleKey: 'billing-manager' })]),
        SSOProviderType.SAML,
        2,
      );
    });
  });
}
