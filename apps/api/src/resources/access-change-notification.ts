import type { Logger } from '@nestjs/common';

import type { NotificationDispatchService } from '../notifications/notification-dispatch.service';

import { NotificationCategory } from '../notifications/notification-types';

/** An access change on a resource or group, with its texts per language. */
export interface AccessChangeNotification {
  userId: number;
  title: (language: string) => string;
  body: (language: string) => string;
  url: string;
  dedupeKey: string;
}

/**
 * The name of a resource or group for an access-change text: `#<id>` when it does not exist or the lookup fails,
 * so the notification is still sent.
 */
export async function nameForAccessChange(
  id: number,
  lookup: (id: number) => Promise<string | null>,
  logger: Logger,
): Promise<string> {
  try {
    return (await lookup(id)) ?? `#${id}`;
  } catch (error) {
    logger.warn(`Failed to look up the name of #${id} for an access-change notification: ${(error as Error).message}`);
    return `#${id}`;
  }
}

/** Sends the same localized texts as push, toast and ACCESS_CHANGE email. */
export function dispatchAccessChange(
  notifications: Pick<NotificationDispatchService, 'dispatchToUser' | 'sendEmailTemplate'>,
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
