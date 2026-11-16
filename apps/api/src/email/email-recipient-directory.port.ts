import type { NotificationRecipient } from '@attraccess/application-models';

/** Looks up the contact data of an account when a caller only knows its id. */
export const EMAIL_RECIPIENT_DIRECTORY = Symbol.for('attraccess.email.recipient-directory');

export interface EmailRecipientDirectory {
  findById(id: number): Promise<NotificationRecipient | null>;
}
