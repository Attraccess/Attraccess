import type { AttractapCardOwner } from '@attraccess/application-models';
import type { NotificationDispatchRequest } from '../notifications/notification-dispatch.service';
import type { UsersService } from '../users-and-auth/users/users.service';

/** The user as the user service and the notification service know it. */
export type CoreUser = NonNullable<Awaited<ReturnType<UsersService['findOne']>>>;

/** The recipient type of a notification. */
export type NotificationRecipient = NotificationDispatchRequest['recipients'][number];

/**
 * A card owner as the services of other modules expect a user. The card store reads the owner as the user row
 * without its relations, so this is the same data under the type those services declare. It goes away when those
 * services speak a neutral user model.
 */
export function asCoreUser(owner: AttractapCardOwner): CoreUser & NotificationRecipient {
  return owner as unknown as CoreUser & NotificationRecipient;
}
