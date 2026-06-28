import { Injectable, Logger } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

@Injectable()
export class UserPermissionsService {
  private readonly logger = new Logger(UserPermissionsService.name);

  constructor(private readonly notifications: NotificationDispatchService) {}

  notifyPermissionsChanged(user: User, actorId: number): void {
    const title = 'Your permissions changed';
    const body = 'Your RBAC role assignments were updated.';

    void this.notifications.dispatch({
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
    }).catch((error) => {
      this.logger.error(`Failed to notify user ${user.id} about permission changes: ${(error as Error).message}`);
    });
  }
}
