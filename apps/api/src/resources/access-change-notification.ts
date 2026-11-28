import type { Logger } from '@nestjs/common';

import type { NotificationDispatchService } from '../notifications/notification-dispatch.service';

import { NotificationCategory } from '../notifications/notification-types';

type AccessChangeNotifications = Pick<NotificationDispatchService, 'dispatchToUser' | 'sendEmailTemplate'>;

/**
 * An access change on a resource or group, with its texts per language. `language` is always the recipient's
 * resolved language (`en` or `de`): the dispatcher resolves it before calling `title`/`body` and `sendEmail`.
 */
export interface AccessChangeNotification {
  userId: number;
  title: (language: string) => string;
  body: (language: string) => string;
  url: string;
  dedupeKey: string;
}

/** The resource or group an access change is about, and how to look up its name. */
export interface AccessChangeSubject {
  kind: 'resource' | 'group';
  id: number;
  findName: (id: number) => Promise<string | null>;
}

/**
 * The name of a resource or group for an access-change text: `#<id>` when it does not exist or the lookup fails,
 * so the notification is still sent.
 */
export async function nameForAccessChange(subject: AccessChangeSubject, logger: Logger): Promise<string> {
  try {
    return (await subject.findName(subject.id)) ?? `#${subject.id}`;
  } catch (error) {
    logger.warn(
      `Failed to look up the name of ${subject.kind} #${subject.id} for an access-change notification: ${(error as Error).message}`,
    );
    return `#${subject.id}`;
  }
}

/** Sends the same localized texts as push, toast and ACCESS_CHANGE email. */
export function dispatchAccessChange(
  notifications: AccessChangeNotifications,
  { userId, title, body, url, dedupeKey }: AccessChangeNotification,
): Promise<void> {
  return notifications.dispatchToUser(userId, {
    category: NotificationCategory.ACCESS_CHANGES,
    title: (recipient) => title(recipient.locale),
    body: (recipient) => body(recipient.locale),
    url,
    dedupeKey,
    sendEmail: (recipient, language) =>
      notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
        accessChange: { title: title(language), body: body(language), url },
      }),
  });
}

/**
 * Fire-and-forget: looks up the subject's name, then notifies the user. Never throws and never delays the caller;
 * every failure is logged.
 */
export function notifyAccessChange(
  notifications: AccessChangeNotifications,
  logger: Logger,
  subject: AccessChangeSubject,
  notification: Omit<AccessChangeNotification, 'body'> & { body: (language: string, name: string) => string },
): void {
  void nameForAccessChange(subject, logger)
    .then((name) =>
      dispatchAccessChange(notifications, { ...notification, body: (language) => notification.body(language, name) }),
    )
    .catch((error) => {
      logger.error(
        `Failed to notify user ${notification.userId} about an access change on ${subject.kind} #${subject.id}: ${(error as Error).message}`,
      );
    });
}
