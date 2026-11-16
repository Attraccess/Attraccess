import type { User } from '@attraccess/database-entities';
import {
  PluginEmailTemplate,
  PluginNotificationCategory,
  PluginNotificationRequest,
  PluginNotificationsContext,
  PluginPermission,
  PluginPermissionError,
} from '@attraccess/plugins-backend-sdk';
import type { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import {
  getPluginNotificationCategory,
  pluginNotificationCategoryKey,
  registerPluginNotificationCategories,
  unregisterPluginNotificationCategories,
  validatePluginNotificationCategories,
} from '../../notifications/plugin-notification-categories';
import type { PluginEmailService } from '../../email/plugin-email.service';
import {
  registerPluginEmailTemplates,
  unregisterPluginEmailTemplates,
  validatePluginEmailTemplates,
} from '../../email-template/plugin-email-templates';

export interface PluginNotificationDeps {
  dispatcher: Pick<NotificationDispatchService, 'dispatch'>;
  email: Pick<PluginEmailService, 'sendPluginEmail' | 'sendPluginTemplate'>;
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
      // Plugin names may contain ".", so the key alone could name a category of plugin "<this>.<x>".
      if (getPluginNotificationCategory(category)?.pluginName !== pluginName) {
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
        sendEmail: email
          ? (recipient) =>
              'template' in email
                ? deps.email.sendPluginTemplate(pluginName, recipient, email.template, email.variables)
                : deps.email.sendPluginEmail(recipient, email)
          : undefined,
      });
    },
  };
}

/** Registration handle for a plugin's notification categories and email templates. */
export interface PluginNotificationRegistration {
  /** (Re-)registers the categories and templates. Idempotent; a no-op when the plugin declares none. Never throws. */
  register(): void;
  unregister(): void;
}

/**
 * Validates a plugin's declared notification categories and email templates against its permissions and returns a
 * handle to register them. Throws (quarantining the plugin) when they are declared without SEND_NOTIFICATIONS or
 * are malformed, before anything of the plugin is registered or queued, so register() cannot fail afterwards.
 * Registration is left to the caller, so a quarantined plugin leaves no category or template behind.
 */
export function preparePluginNotifications(
  pluginName: string,
  permissions: readonly PluginPermission[],
  categories: readonly PluginNotificationCategory[] | undefined,
  emailTemplates?: readonly PluginEmailTemplate[],
): PluginNotificationRegistration {
  const declared = categories ?? [];
  const templates = emailTemplates ?? [];
  const canNotify = permissions.includes(PluginPermission.SEND_NOTIFICATIONS);
  if (declared.length && !canNotify) {
    throw new PluginPermissionError(pluginName, 'notificationCategories', PluginPermission.SEND_NOTIFICATIONS);
  }
  if (templates.length && !canNotify) {
    throw new PluginPermissionError(pluginName, 'emailTemplates', PluginPermission.SEND_NOTIFICATIONS);
  }
  validatePluginNotificationCategories(pluginName, declared);
  validatePluginEmailTemplates(pluginName, templates);
  return {
    register: () => {
      if (declared.length) registerPluginNotificationCategories(pluginName, declared);
      if (templates.length) registerPluginEmailTemplates(pluginName, templates);
    },
    unregister: () => {
      unregisterPluginNotificationCategories(pluginName);
      if (templates.length) unregisterPluginEmailTemplates(pluginName);
    },
  };
}
