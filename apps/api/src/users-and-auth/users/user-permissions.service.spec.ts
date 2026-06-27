import { ForbiddenException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserPermissionsService } from './user-permissions.service';
import { UsersService } from './users.service';
import { RbacService } from '../rbac/rbac.service';
import { User } from '@attraccess/database-entities';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

const RESOURCE_MANAGER_ROLE = {
  id: 1,
  key: 'resource-manager',
  rolePermissions: [{ permissionKey: 'resources.update' }, { permissionKey: 'resources.create' }],
};
const USER_MANAGER_ROLE = {
  id: 2,
  key: 'user-manager',
  rolePermissions: [{ permissionKey: 'users.update' }, { permissionKey: 'users.create' }],
};
const SYSTEM_ADMIN_ROLE = {
  id: 3,
  key: 'system-admin',
  rolePermissions: [{ permissionKey: 'system.settings.manage' }],
};
const BILLING_MANAGER_ROLE = {
  id: 4,
  key: 'billing-manager',
  rolePermissions: [{ permissionKey: 'billing.manage' }],
};
const ALL_ROLES = [RESOURCE_MANAGER_ROLE, USER_MANAGER_ROLE, SYSTEM_ADMIN_ROLE, BILLING_MANAGER_ROLE];

const ALL_PERMISSIONS = new Set([
  'resources.update',
  'resources.create',
  'users.update',
  'users.create',
  'system.settings.manage',
  'billing.manage',
  'users.roles.manage',
]);

describe('UserPermissionsService', () => {
  let service: UserPermissionsService;
  let usersService: { findOne: jest.Mock; findByPermission: jest.Mock };
  let rbacService: {
    getRoles: jest.Mock;
    getUserRoles: jest.Mock;
    assignRole: jest.Mock;
    revokeRole: jest.Mock;
    getEffectivePermissions: jest.Mock;
  };
  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };

  const requestUser = {
    id: 99,
    effectivePermissions: ALL_PERMISSIONS,
  } as never as User;

  const targetUser = { id: 1, username: 'alice' } as User;

  beforeEach(async () => {
    notifications = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      sendEmailTemplate: jest.fn().mockResolvedValue(undefined),
    };

    rbacService = {
      getRoles: jest.fn().mockResolvedValue(ALL_ROLES),
      getUserRoles: jest.fn().mockResolvedValue([]),
      assignRole: jest.fn().mockResolvedValue(undefined),
      revokeRole: jest.fn().mockResolvedValue(undefined),
      getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()),
    };

    usersService = {
      findOne: jest.fn().mockResolvedValue(targetUser),
      findByPermission: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPermissionsService,
        { provide: UsersService, useValue: usersService },
        { provide: RbacService, useValue: rbacService },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get<UserPermissionsService>(UserPermissionsService);
  });

  describe('updatePermissions', () => {
    it('throws ForbiddenException when actor updates their own permissions', async () => {
      await expect(
        service.updatePermissions(requestUser.id, { canManageResources: true }, requestUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws UserNotFoundException when user does not exist', async () => {
      usersService.findOne.mockResolvedValueOnce(null);
      await expect(
        service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser),
      ).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('calls assignRole when a permission flag is set to true', async () => {
      // findOne called twice: once to get user, once after update
      usersService.findOne.mockResolvedValue(targetUser);

      await service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser);

      expect(rbacService.assignRole).toHaveBeenCalledWith(
        targetUser.id,
        RESOURCE_MANAGER_ROLE.id,
        ALL_PERMISSIONS,
      );
    });

    it('calls revokeRole when a permission flag is set to false and user has the role', async () => {
      rbacService.getUserRoles.mockResolvedValue([{ roleId: RESOURCE_MANAGER_ROLE.id }]);

      await service.updatePermissions(targetUser.id, { canManageResources: false }, requestUser);

      expect(rbacService.revokeRole).toHaveBeenCalledWith(targetUser.id, RESOURCE_MANAGER_ROLE.id);
    });

    it('skips revokeRole when user does not have the role', async () => {
      rbacService.getUserRoles.mockResolvedValue([]);

      await service.updatePermissions(targetUser.id, { canManageResources: false }, requestUser);

      expect(rbacService.revokeRole).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when actor lacks permissions to grant a role', async () => {
      const limitedRequestUser = {
        id: 99,
        effectivePermissions: new Set(['billing.manage']), // only has billing, not resources.*
      } as never as User;

      await expect(
        service.updatePermissions(targetUser.id, { canManageResources: true }, limitedRequestUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('dispatches notification when permissions changed', async () => {
      await service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser);

      expect(notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [expect.objectContaining({ id: targetUser.id })],
          title: 'Your permissions changed',
          actorId: requestUser.id,
          sendEmail: expect.any(Function),
        }),
      );
    });

    it('does not dispatch notification when no roles changed', async () => {
      // Only undefined flags — no changes
      await service.updatePermissions(targetUser.id, {}, requestUser);

      expect(notifications.dispatch).not.toHaveBeenCalled();
    });

    it('does not fail the permission update when notification dispatch fails', async () => {
      notifications.dispatch.mockRejectedValue(new Error('push unavailable'));
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(
        service.updatePermissions(targetUser.id, { canManageResources: true }, requestUser),
      ).resolves.toBe(targetUser);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Failed to notify user ${targetUser.id} about permission changes: push unavailable`,
      );
      loggerSpy.mockRestore();
    });

    it('handles all four permission flags in a single call', async () => {
      rbacService.getUserRoles.mockResolvedValue([
        { roleId: SYSTEM_ADMIN_ROLE.id },
        { roleId: BILLING_MANAGER_ROLE.id },
      ]);

      await service.updatePermissions(
        targetUser.id,
        {
          canManageResources: true,
          canManageSystemConfiguration: false,
          canManageUsers: true,
          canManageBilling: false,
        },
        requestUser,
      );

      expect(rbacService.assignRole).toHaveBeenCalledWith(targetUser.id, RESOURCE_MANAGER_ROLE.id, ALL_PERMISSIONS);
      expect(rbacService.assignRole).toHaveBeenCalledWith(targetUser.id, USER_MANAGER_ROLE.id, ALL_PERMISSIONS);
      expect(rbacService.revokeRole).toHaveBeenCalledWith(targetUser.id, SYSTEM_ADMIN_ROLE.id);
      expect(rbacService.revokeRole).toHaveBeenCalledWith(targetUser.id, BILLING_MANAGER_ROLE.id);
    });
  });

  describe('bulkUpdatePermissions', () => {
    it('skips own-user updates in bulk operation', async () => {
      await service.bulkUpdatePermissions(
        { updates: [{ userId: requestUser.id, permissions: { canManageResources: true } }] },
        requestUser,
      );

      expect(rbacService.assignRole).not.toHaveBeenCalled();
    });

    it('updates multiple users in a single call', async () => {
      const userA = { id: 10, username: 'a' } as User;
      const userB = { id: 11, username: 'b' } as User;
      usersService.findOne.mockImplementation(({ id }: { id: number }) =>
        Promise.resolve(id === 10 ? userA : id === 11 ? userB : null),
      );

      await service.bulkUpdatePermissions(
        {
          updates: [
            { userId: 10, permissions: { canManageResources: true } },
            { userId: 11, permissions: { canManageBilling: true } },
          ],
        },
        requestUser,
      );

      expect(rbacService.assignRole).toHaveBeenCalledWith(10, RESOURCE_MANAGER_ROLE.id, ALL_PERMISSIONS);
      expect(rbacService.assignRole).toHaveBeenCalledWith(11, BILLING_MANAGER_ROLE.id, ALL_PERMISSIONS);
    });
  });

  describe('getPermissions', () => {
    it('returns boolean shape derived from effective RBAC permissions', async () => {
      rbacService.getEffectivePermissions.mockResolvedValue(
        new Set(['resources.update', 'resources.create', 'billing.manage']),
      );

      const result = await service.getPermissions(targetUser.id);

      expect(result).toEqual({
        canManageResources: true,
        canManageSystemConfiguration: false,
        canManageUsers: false,
        canManageBilling: true,
      });
    });

    it('throws UserNotFoundException when user does not exist', async () => {
      usersService.findOne.mockResolvedValueOnce(null);

      await expect(service.getPermissions(999)).rejects.toBeInstanceOf(UserNotFoundException);
    });
  });
});
