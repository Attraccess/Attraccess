import type { User } from '@attraccess/database-entities';
import type { PluginNotificationRequest, PluginNotificationsContext } from '@attraccess/plugins-backend-sdk';
import type { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import {
  getPluginNotificationCategory,
  pluginNotificationCategoryKey,
} from '../../notifications/plugin-notification-categories';
import type { PluginEmailService } from '../../email/plugin-email.service';

export interface PluginNotificationDeps {
  dispatcher: Pick<NotificationDispatchService, 'dispatch'>;
  email: Pick<PluginEmailService, 'sendPluginEmail'>;
  findUsers(userIds: number[]): Promise<User[]>;
}

/** Plugin-facing notification dispatch, bound to one plugin's category namespace. */
export function createPluginNotificationsContext(
  pluginName: string,
  getDeps: () => PluginNotificationDeps,
): PluginNotificationsContext {
  return {
    async dispatch(request: PluginNotificationRequest): Promise<void> {
      const category = pluginNotificationCategoryKey(pluginName, request.category);
      if (!getPluginNotificationCategory(category)) {
        throw new Error(
          `Plugin "${pluginName}" dispatched to undeclared notification category "${request.category}". ` +
            'Declare it in notificationCategories of the plugin backend module.',
        );
      }
      const deps = getDeps();
      const recipients = await deps.findUsers([...new Set(request.recipients)]);
      if (recipients.length === 0) return;
      const { email } = request;
      await deps.dispatcher.dispatch({
        category,
        recipients,
        title: request.title,
        body: request.body,
        url: request.url,
        severity: request.severity,
        dedupeKey: request.dedupeKey,
        sendEmail: email ? (recipient) => deps.email.sendPluginEmail(recipient, email) : undefined,
      });
    },
  };
}
