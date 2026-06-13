import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  AuthenticationType,
  SSOProviderType,
  SystemPermissions,
  User,
} from '@attraccess/database-entities';
import { getSsoManagedPermissionKeys } from '@attraccess/shared';
import { UsersService } from './users.service';
import { SSOService } from '../auth/sso/sso.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { UpdateUserPermissionsDto } from './dtos/updateUserPermissions.dto';
import { BulkUpdateUserPermissionsDto } from './dtos/bulkUpdateUserPermissions.dto';
import { PermissionFilter } from './dtos/getUsersWithPermissionQuery.dto';
import { PaginatedUsersResponseDto } from './dtos/paginatedUsersResponse.dto';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

/**
 * System-permission reads/writes for users, honoring SSO-managed permission
 * mappings and grant-only-what-you-have rules.
 */
@Injectable()
export class UserPermissionsService {
  private readonly logger = new Logger(UserPermissionsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly ssoService: SSOService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private permissionsChanged(before: Partial<SystemPermissions>, after: Partial<SystemPermissions>): boolean {
    return (Object.keys(after) as Array<keyof SystemPermissions>).some((key) => before[key] !== after[key]);
  }

  private notifyPermissionsChanged(user: User, actorId: number): void {
    void this.notifications.dispatch({
      category: NotificationCategory.ACCESS_CHANGES,
      recipients: [user],
      title: 'Your permissions changed',
      body: 'Your system permissions were updated.',
      actorId,
      dedupeKey: `system-permissions-${user.id}`,
    }).catch((error) => {
      this.logger.error(`Failed to notify user ${user.id} about permission changes: ${(error as Error).message}`);
    });
  }

  private async getSsoManagedPermissions(user: User): Promise<string[]> {
    const authenticationDetails = user.authenticationDetails ?? [];
    const ssoDetails = authenticationDetails.filter(
      (detail) => detail.type === AuthenticationType.SSO && detail.providerId && detail.providerType,
    );

    if (ssoDetails.length === 0) {
      return [];
    }

    const ssoManagedKeys = new Set<string>();

    for (const detail of ssoDetails) {
      const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(
        detail.providerType as SSOProviderType,
        detail.providerId as number,
      );

      if (!provider) {
        continue;
      }

      const permissionMappings =
        detail.providerType === SSOProviderType.OIDC
          ? provider.oidcConfiguration?.permissionMappings
          : provider.samlConfiguration?.permissionMappings;

      getSsoManagedPermissionKeys(permissionMappings).forEach((key) => ssoManagedKeys.add(key));
    }

    return Array.from(ssoManagedKeys);
  }

  /**
   * Validates that a user can grant the specified permissions
   * @param user The user attempting to grant permissions
   * @param permissions The permissions being granted
   * @throws ForbiddenException if the user tries to grant a permission they don't have
   */
  private validateCanGrantPermissions(user: User, permissions: Partial<SystemPermissions>): void {
    for (const permission of Object.keys(permissions)) {
      // If the permission is being set to true, check if the user has it
      if (permissions[permission] === true && !user.systemPermissions[permission]) {
        this.logger.warn(`User ${user.id} attempted to grant ${permission} permission they don't have`);
        throw new ForbiddenException('You cannot grant permissions you do not have');
      }
    }
  }

  public async updatePermissions(
    id: number,
    body: UpdateUserPermissionsDto,
    requestUser: User,
  ): Promise<User> {
    this.logger.debug(`Updating permissions for user ID: ${id}, by user ID: ${requestUser.id}`);

    // Prevent users from updating their own permissions
    if (requestUser.id === id) {
      this.logger.warn(`User ${id} attempted to update their own permissions`);
      throw new ForbiddenException('You cannot update your own permissions');
    }

    // Validate the user can grant the requested permissions
    this.validateCanGrantPermissions(requestUser, body);

    // Get the user to update
    const user = await this.usersService.findOne({ id }, ['authenticationDetails']);
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    const ssoManagedPermissions = await this.getSsoManagedPermissions(user);

    // Create an update object with just the systemPermissions
    const updates: Partial<User> = {
      systemPermissions: {
        ...user.systemPermissions,
      },
    };

    // Update only the permissions that were specified in the request AND are not managed by SSO
    if (body.canManageResources !== undefined && !ssoManagedPermissions.includes('canManageResources')) {
      updates.systemPermissions.canManageResources = body.canManageResources;
    }

    if (body.canManageSystemConfiguration !== undefined && !ssoManagedPermissions.includes('canManageSystemConfiguration')) {
      updates.systemPermissions.canManageSystemConfiguration = body.canManageSystemConfiguration;
    }

    if (body.canManageUsers !== undefined && !ssoManagedPermissions.includes('canManageUsers')) {
      updates.systemPermissions.canManageUsers = body.canManageUsers;
    }

    if (body.canManageBilling !== undefined && !ssoManagedPermissions.includes('canManageBilling')) {
      updates.systemPermissions.canManageBilling = body.canManageBilling;
    }

    this.logger.debug(`Applying permission updates for user ID: ${id}: ${JSON.stringify(updates.systemPermissions)}`);

    // Update the user
    const updatedUser = await this.usersService.updateOne(id, updates);
    this.logger.debug(`Successfully updated permissions for user ID: ${id}`);

    if (this.permissionsChanged(user.systemPermissions, updates.systemPermissions)) {
      this.notifyPermissionsChanged(updatedUser, requestUser.id);
    }

    return updatedUser;
  }

  public async bulkUpdatePermissions(body: BulkUpdateUserPermissionsDto, requestUser: User): Promise<User[]> {
    this.logger.debug(`Bulk updating permissions for ${body.updates.length} users, by user ID: ${requestUser.id}`);

    // First, validate that the user is not trying to grant permissions they don't have
    for (const update of body.updates) {
      this.validateCanGrantPermissions(requestUser, update.permissions);
    }

    const updatedUsers: User[] = [];
    const updateCandidates: Array<{ update: BulkUpdateUserPermissionsDto['updates'][number]; user: User; ssoManagedPermissions: string[] }> = [];

    for (const update of body.updates) {
      // Skip if user is trying to update their own permissions
      if (requestUser.id === update.userId) {
        this.logger.warn(`User ${update.userId} attempted to update their own permissions in bulk operation, skipping`);
        continue;
      }

      const user = await this.usersService.findOne({ id: update.userId }, ['authenticationDetails']);
      if (!user) {
        this.logger.debug(`User not found with ID: ${update.userId}, skipping`);
        continue;
      }

      const ssoManagedPermissions = await this.getSsoManagedPermissions(user);
      updateCandidates.push({ update, user, ssoManagedPermissions });
    }

    for (const { update, user, ssoManagedPermissions } of updateCandidates) {
      try {
        // Create an update object with just the systemPermissions
        const updates: Partial<User> = {
          systemPermissions: {
            ...user.systemPermissions,
          },
        };

        // Update only the permissions that were specified in the request AND are not managed by SSO
        if (update.permissions.canManageResources !== undefined && !ssoManagedPermissions.includes('canManageResources')) {
          updates.systemPermissions.canManageResources = update.permissions.canManageResources;
        }

        if (update.permissions.canManageSystemConfiguration !== undefined && !ssoManagedPermissions.includes('canManageSystemConfiguration')) {
          updates.systemPermissions.canManageSystemConfiguration = update.permissions.canManageSystemConfiguration;
        }

        if (update.permissions.canManageUsers !== undefined && !ssoManagedPermissions.includes('canManageUsers')) {
          updates.systemPermissions.canManageUsers = update.permissions.canManageUsers;
        }

        if (update.permissions.canManageBilling !== undefined && !ssoManagedPermissions.includes('canManageBilling')) {
          updates.systemPermissions.canManageBilling = update.permissions.canManageBilling;
        }

        this.logger.debug(
          `Applying permission updates for user ID: ${update.userId}: ${JSON.stringify(updates.systemPermissions)}`,
        );

        // Update the user
        const updatedUser = await this.usersService.updateOne(update.userId, updates);
        this.logger.debug(`Successfully updated permissions for user ID: ${update.userId}`);

        if (this.permissionsChanged(user.systemPermissions, updates.systemPermissions)) {
          this.notifyPermissionsChanged(updatedUser, requestUser.id);
        }

        updatedUsers.push(updatedUser);
      } catch (error) {
        this.logger.error(`Error updating user ID: ${update.userId}: ${error.message}`);
        // Continue with the next user even if there's an error
      }
    }

    this.logger.debug(`Successfully updated ${updatedUsers.length} users`);
    return updatedUsers;
  }

  public async getPermissions(id: number): Promise<SystemPermissions> {
    this.logger.debug(`Getting permissions for user ID: ${id}`);

    // Get the user
    const user = await this.usersService.findOne({ id });
    if (!user) {
      this.logger.debug(`User not found with ID: ${id}`);
      throw new UserNotFoundException(id);
    }

    this.logger.debug(`Returning permissions for user ID: ${id}`);
    return user.systemPermissions;
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
