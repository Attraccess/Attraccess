import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserPermissionsService } from './user-permissions.service';
import { UsersService } from './users.service';
import { SSOService } from '../auth/sso/sso.service';
import { User, AuthenticationType, SSOProviderType, SystemPermissions } from '@attraccess/database-entities';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

describe('UserPermissionsService', () => {
  let service: UserPermissionsService;
  let usersService: UsersService;
  let ssoService: SSOService;
  let notifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPermissionsService,
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            updateOne: jest.fn(),
            findByPermission: jest.fn(),
          },
        },
        {
          provide: SSOService,
          useValue: { getProviderByTypeAndIdWithConfiguration: jest.fn() },
        },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get<UserPermissionsService>(UserPermissionsService);
    usersService = module.get<UsersService>(UsersService);
    ssoService = module.get<SSOService>(SSOService);
  });

  const requestUser = {
    id: 99,
    systemPermissions: {
      canManageResources: true,
      canManageSystemConfiguration: true,
      canManageUsers: true,
      canManageBilling: true,
    },
  } as User;

  describe('updatePermissions', () => {
    it('allows updating non-SSO-mapped permissions when only some permissions have SSO mappings', async () => {
      const targetUser = {
        id: 1,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 42 }],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
        oidcConfiguration: { permissionMappings: { canManageUsers: ['admins'] } },
      } as never);

      await service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser);

      expect(usersService.updateOne).toHaveBeenCalledWith(
        targetUser.id,
        expect.objectContaining({
          systemPermissions: expect.objectContaining({ canManageResources: true }),
        }),
      );
    });

    it('silently skips SSO-mapped permissions included in the request body', async () => {
      const targetUser = {
        id: 1,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 42 }],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
        oidcConfiguration: { permissionMappings: { canManageResources: ['resource-admins'] } },
      } as never);

      await service.updatePermissions(
        targetUser.id,
        { canManageResources: true, canManageSystemConfiguration: true },
        requestUser,
      );

      const savedPermissions = (usersService.updateOne as jest.Mock).mock.calls[0][1].systemPermissions;
      expect(savedPermissions.canManageResources).toBe(false);
      expect(savedPermissions.canManageSystemConfiguration).toBe(true);
    });

    it('applies full update when user has no SSO permission mappings', async () => {
      const targetUser = {
        id: 1,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);

      await service.updatePermissions(targetUser.id, { canManageResources: true, canManageUsers: true }, requestUser);

      expect(usersService.updateOne).toHaveBeenCalledWith(
        targetUser.id,
        expect.objectContaining({
          systemPermissions: expect.objectContaining({ canManageResources: true, canManageUsers: true }),
        }),
      );
    });

    it('notifies the user when applied system permissions change', async () => {
      const targetUser = {
        id: 1,
        username: 'alice',
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue({
        ...targetUser,
        systemPermissions: { ...targetUser.systemPermissions, canManageResources: true },
      } as User);

      await service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser);

      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [expect.objectContaining({ id: targetUser.id })],
          title: 'Your permissions changed',
          body: 'Your system permissions were updated.',
          actorId: requestUser.id,
        }),
      );
    });

    it('does not fail the permission update when notification dispatch fails', async () => {
      const targetUser = {
        id: 1,
        username: 'alice',
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [],
      } as User;
      const updatedUser = {
        ...targetUser,
        systemPermissions: { ...targetUser.systemPermissions, canManageResources: true },
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(updatedUser);
      notifications.dispatch.mockRejectedValue(new Error('push unavailable'));
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser)).resolves.toBe(
        updatedUser,
      );
      expect(usersService.updateOne).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith('Failed to notify user 1 about permission changes: push unavailable');
      loggerSpy.mockRestore();
    });

    it('saves canManageBilling when included in the request', async () => {
      const targetUser = {
        id: 1,
        systemPermissions: {
          canManageResources: true,
          canManageSystemConfiguration: true,
          canManageUsers: true,
          canManageBilling: true,
        },
        authenticationDetails: [],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);

      await service.updatePermissions(
        targetUser.id,
        { canManageResources: true, canManageSystemConfiguration: true, canManageUsers: true, canManageBilling: false },
        requestUser,
      );

      expect(usersService.updateOne).toHaveBeenCalledWith(
        targetUser.id,
        expect.objectContaining({
          systemPermissions: expect.objectContaining({ canManageBilling: false }),
        }),
      );
    });

    /**
     * Regression guard: every key on SystemPermissions must round-trip through
     * updatePermissions. If a new permission is added to the entity but forgotten
     * in UpdateUserPermissionsDto or the handler, this test fails.
     */
    it('persists every SystemPermissions field — regression guard for missing DTO/handler entries', async () => {
      const allTrue: SystemPermissions = {
        canManageResources: true,
        canManageSystemConfiguration: true,
        canManageUsers: true,
        canManageBilling: true,
      };

      const targetUser = {
        id: 1,
        systemPermissions: { ...allTrue },
        authenticationDetails: [],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);

      const allFalse = Object.fromEntries(
        (Object.keys(allTrue) as Array<keyof SystemPermissions>).map((k) => [k, false]),
      ) as Record<keyof SystemPermissions, boolean>;

      await service.updatePermissions(targetUser.id, allFalse, requestUser);

      const saved = (usersService.updateOne as jest.Mock).mock.calls[0][1].systemPermissions;

      for (const key of Object.keys(allTrue) as Array<keyof SystemPermissions>) {
        expect(saved[key]).toBe(false);
      }
    });

    it('does not apply any changes when all requested permissions are SSO-managed', async () => {
      const targetUser = {
        id: 1,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 42 }],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(targetUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue(targetUser);
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
        oidcConfiguration: {
          permissionMappings: {
            canManageResources: ['r'],
            canManageUsers: ['u'],
            canManageSystemConfiguration: ['s'],
          },
        },
      } as never);

      await service.updatePermissions(
        targetUser.id,
        { canManageResources: true, canManageUsers: true, canManageSystemConfiguration: true },
        requestUser,
      );

      const savedPermissions = (usersService.updateOne as jest.Mock).mock.calls[0][1].systemPermissions;
      expect(savedPermissions.canManageResources).toBe(false);
      expect(savedPermissions.canManageUsers).toBe(false);
      expect(savedPermissions.canManageSystemConfiguration).toBe(false);
    });
  });

  describe('bulkUpdatePermissions', () => {
    it('applies only non-SSO-managed permissions for SSO users in bulk update', async () => {
      const ssoUser = {
        id: 2,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 7 }],
      } as User;
      const normalUser = {
        id: 3,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [],
      } as User;

      jest
        .spyOn(usersService, 'findOne')
        .mockImplementation(({ id }) => Promise.resolve(id === 2 ? ssoUser : id === 3 ? normalUser : null));
      jest.spyOn(usersService, 'updateOne').mockImplementation(async (id) => (id === ssoUser.id ? ssoUser : normalUser));
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
        oidcConfiguration: { permissionMappings: { canManageResources: ['resource-admins'] } },
      } as never);

      await service.bulkUpdatePermissions(
        {
          updates: [
            { userId: ssoUser.id, permissions: { canManageResources: true, canManageSystemConfiguration: true } },
            { userId: normalUser.id, permissions: { canManageResources: true } },
          ],
        },
        requestUser,
      );

      const ssoCall = (usersService.updateOne as jest.Mock).mock.calls.find(([id]) => id === ssoUser.id);
      expect(ssoCall).toBeDefined();
      expect(ssoCall[1].systemPermissions.canManageResources).toBe(false);
      expect(ssoCall[1].systemPermissions.canManageSystemConfiguration).toBe(true);

      const normalCall = (usersService.updateOne as jest.Mock).mock.calls.find(([id]) => id === normalUser.id);
      expect(normalCall).toBeDefined();
      expect(normalCall[1].systemPermissions.canManageResources).toBe(true);
    });

    it('includes SSO users in bulk result when their update contains non-SSO-managed permissions', async () => {
      const ssoUser = {
        id: 2,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [{ type: AuthenticationType.SSO, providerType: SSOProviderType.OIDC, providerId: 7 }],
      } as User;
      const normalUser = {
        id: 3,
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [],
      } as User;

      jest
        .spyOn(usersService, 'findOne')
        .mockImplementation(({ id }) => Promise.resolve(id === 2 ? ssoUser : id === 3 ? normalUser : null));
      jest.spyOn(usersService, 'updateOne').mockImplementation(async (id) => (id === ssoUser.id ? ssoUser : normalUser));
      jest.spyOn(ssoService, 'getProviderByTypeAndIdWithConfiguration').mockResolvedValue({
        oidcConfiguration: { permissionMappings: { canManageResources: ['admins'] } },
      } as never);

      const result = await service.bulkUpdatePermissions(
        {
          updates: [
            { userId: ssoUser.id, permissions: { canManageSystemConfiguration: true } },
            { userId: normalUser.id, permissions: { canManageResources: true } },
          ],
        },
        requestUser,
      );

      expect(result).toHaveLength(2);
      expect(usersService.updateOne).toHaveBeenCalledTimes(2);
    });

    it('notifies each user whose permissions change in a bulk update', async () => {
      const normalUser = {
        id: 3,
        username: 'bob',
        systemPermissions: {
          canManageResources: false,
          canManageSystemConfiguration: false,
          canManageUsers: false,
          canManageBilling: false,
        },
        authenticationDetails: [],
      } as User;

      jest.spyOn(usersService, 'findOne').mockResolvedValue(normalUser);
      jest.spyOn(usersService, 'updateOne').mockResolvedValue({
        ...normalUser,
        systemPermissions: { ...normalUser.systemPermissions, canManageResources: true },
      } as User);

      await service.bulkUpdatePermissions(
        { updates: [{ userId: normalUser.id, permissions: { canManageResources: true } }] },
        requestUser,
      );

      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [expect.objectContaining({ id: normalUser.id })],
          title: 'Your permissions changed',
          body: 'Your system permissions were updated.',
          actorId: requestUser.id,
        }),
      );
    });
  });
});
