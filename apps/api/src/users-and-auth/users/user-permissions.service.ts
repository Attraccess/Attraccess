import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { UsersService } from './users.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { UpdateUserPermissionsDto } from './dtos/updateUserPermissions.dto';
import { BulkUpdateUserPermissionsDto } from './dtos/bulkUpdateUserPermissions.dto';
import { PermissionFilter } from './dtos/getUsersWithPermissionQuery.dto';
import { PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../rbac/rbac.service';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

// Maps old boolean permission flags to the role keys they correspond to
const PERMISSION_TO_ROLE: Record<string, string> = {
  canManageResources: 'resource-manager',
  canManageSystemConfiguration: 'system-admin',
  canManageUsers: 'user-manager',
  canManageBilling: 'billing-manager',
};

@Injectable()
export class UserPermissionsService {
  private readonly logger = new Logger(UserPermissionsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private notifyPermissionsChanged(user: User, actorId: number): void {
    const title = 'Your permissions changed';
    const body = 'Your system permissions were updated.';

    void this.notifications.dispatch({
      category: NotificationCategory.ACCESS_CHANGES,
      recipients: [user],
      title,
      body,
      actorId,
      dedupeKey: `system-permissions-${user.id}`,
      sendEmail: (recipient) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
          accessChange: { title, body },
        }),
    }).catch((error) => {
      this.logger.error(`Failed to notify user ${user.id} about permission changes: ${(error as Error).message}`);
    });
  }

  public async updatePermissions(id: number, body: UpdateUserPermissionsDto, requestUser: User): Promise<User> {
    this.logger.debug(`Updating permissions for user ID: ${id}, by user ID: ${requestUser.id}`);

    if (requestUser.id === id) {
      this.logger.warn(`User ${id} attempted to update their own permissions`);
      throw new ForbiddenException('You cannot update your own permissions');
    }

    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    const actorPermissions = (requestUser as AuthenticatedUser).effectivePermissions ?? new Set<string>();
    const roles = await this.rbacService.getRoles();
    let changed = false;

    for (const [flag, roleKey] of Object.entries(PERMISSION_TO_ROLE)) {
      const value = (body as Record<string, boolean | undefined>)[flag];
      if (value === undefined) continue;

      const role = roles.find((r) => r.key === roleKey);
      if (!role) continue;

      if (value) {
        // cannot-grant-what-you-don't-have: actor must hold all role permissions
        const rolePermKeys = role.rolePermissions?.map((rp) => rp.permissionKey) ?? [];
        const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
        if (missing.length > 0) {
          throw new ForbiddenException('You cannot grant permissions you do not have');
        }
        await this.rbacService.assignRole(id, role.id, actorPermissions);
        changed = true;
      } else {
        const userRoles = await this.rbacService.getUserRoles(id);
        const existing = userRoles.find((ur) => ur.roleId === role.id);
        if (existing) {
          await this.rbacService.revokeRole(id, role.id);
          changed = true;
        }
      }
    }

    const updatedUser = await this.usersService.findOne({ id });
    if (!updatedUser) throw new UserNotFoundException(id);

    if (changed) {
      this.notifyPermissionsChanged(updatedUser, requestUser.id);
    }

    return updatedUser;
  }

  public async bulkUpdatePermissions(body: BulkUpdateUserPermissionsDto, requestUser: User): Promise<User[]> {
    this.logger.debug(`Bulk updating permissions for ${body.updates.length} users, by user ID: ${requestUser.id}`);

    const updatedUsers: User[] = [];
    for (const update of body.updates) {
      if (requestUser.id === update.userId) {
        this.logger.warn(`User ${update.userId} attempted to update their own permissions in bulk operation, skipping`);
        continue;
      }
      try {
        const updated = await this.updatePermissions(update.userId, update.permissions, requestUser);
        updatedUsers.push(updated);
      } catch (error) {
        this.logger.error(`Error updating user ID: ${update.userId}: ${(error as Error).message}`);
      }
    }

    this.logger.debug(`Successfully updated ${updatedUsers.length} users`);
    return updatedUsers;
  }

  public async getPermissions(id: number): Promise<Record<string, boolean>> {
    this.logger.debug(`Getting permissions for user ID: ${id}`);

    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    const effectivePermissions = await this.rbacService.getEffectivePermissions(id);

    // Map effective RBAC permissions back to the legacy boolean shape for backward compat
    return {
      canManageResources: effectivePermissions.has('resources.update'),
      canManageSystemConfiguration: effectivePermissions.has('system.settings.manage'),
      canManageUsers: effectivePermissions.has('users.update'),
      canManageBilling: effectivePermissions.has('billing.manage'),
    };
  }

  public async getAllWithPermission(query: {
    permission?: PermissionFilter;
    page: number;
    limit: number;
  }): Promise<PaginatedUsersResponseDto> {
    const permission = query.permission || PermissionFilter.canManageUsers;

    this.logger.debug(`Getting users with permission: ${permission}, page: ${query.page}, limit: ${query.limit}`);

    const result = (await this.usersService.findByPermission(permission, {
      page: query.page,
      limit: query.limit,
    })) as PaginatedUsersResponseDto;

    this.logger.debug(
      `Found ${result.total} users with permission ${permission}, returning ${result.data.length} users`,
    );

    return result;
  }
}
