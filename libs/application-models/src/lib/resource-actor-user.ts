import type { NotificationRecipient } from './notification-recipient';
/**
 * The account fields that resource features show next to an action (who created, resolved or completed
 * something). Plain data: no secrets, tokens, e-mail address or lockout state.
 */
export interface ResourceActorUser {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  externalIdentifier: string | null;
  creditBalance: number;
  billingFactor: number;
}

/** A user a resource notification is addressed to: the recipient the notification dispatcher takes. */
export type ResourceNotificationRecipient = NotificationRecipient;
