import { Inject, Injectable, Logger } from '@nestjs/common';
import { User, UserRole } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { identityAuditEvent } from '../../audit/policies/identity';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from './users.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

@Injectable()
export class UserPermissionsService {
  private readonly logger = new Logger(UserPermissionsService.name);

  constructor(
    private readonly notifications: NotificationDispatchService,
    private readonly rbacService: RbacService,
    private readonly usersService: UsersService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /** Assigns a role within the actor's own permissions, notifies the user and audits the assignment. */
  async assignRole(userId: number, roleId: number, actor: AuthenticatedUser, origin: AuditOrigin): Promise<UserRole> {
    const result = await this.rbacService.assignRole(userId, roleId, actor.effectivePermissions ?? new Set());
    const user = await this.usersService.findOne({ id: userId });
    if (user) this.notifyPermissionsChanged(user, actor.id);
    await this.recordRoleChange('user_role_assigned', userId, roleId, origin);
    return result;
  }

  async revokeRole(userId: number, roleId: number, actor: AuthenticatedUser, origin: AuditOrigin): Promise<void> {
    await this.rbacService.revokeRole(userId, roleId, actor.effectivePermissions ?? new Set());
    const user = await this.usersService.findOne({ id: userId });
    if (!user) throw new UserNotFoundException(userId);
    this.notifyPermissionsChanged(user, actor.id);
    await this.recordRoleChange('user_role_removed', userId, roleId, origin);
  }

  private async recordRoleChange(
    action: 'user_role_assigned' | 'user_role_removed',
    userId: number,
    roleId: number,
    origin: AuditOrigin,
  ): Promise<void> {
    let roleKey: string | null;
    try {
      roleKey = await this.rbacService.getRoleKey(roleId);
    } catch {
      // The role change is already applied; a failed label lookup must not turn it into an error response.
      this.logger.warn(`Audit record not written: role lookup failed for action=${action}`);
      return;
    }
    if (!roleKey) return;
    await this.audit.record(identityAuditEvent(action, origin, { id: userId }, { role: roleKey }));
  }

  notifyPermissionsChanged(user: User, actorId: number): void {
    const title = 'Your permissions changed';
    const body = 'Your RBAC role assignments were updated.';

    void this.notifications
      .dispatch({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [user],
        title,
        body,
        actorId,
        dedupeKey: `rbac-roles-${user.id}`,
        sendEmail: (recipient) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
            accessChange: { title, body },
          }),
      })
      .catch((error) => {
        this.logger.error(`Failed to notify user ${user.id} about permission changes: ${(error as Error).message}`);
      });
  }
}
