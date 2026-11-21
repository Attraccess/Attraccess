import type { NotificationRecipient } from '@attraccess/application-models';

export interface NotifiableParticipant {
  participantId: number;
  userId: number;
  lastReadAt: Date | null;
  lastNotifiedAt: Date | null;
  /** Null when the account is gone (deleted) and cannot be notified. */
  recipient: NotificationRecipient | null;
}

/** What the new-message notifications read and write: who is in the conversation and who was already emailed. */
export const MESSAGE_NOTIFICATION_STORE = Symbol.for('attraccess.messaging.notification-store');

export interface MessageNotificationStore {
  findParticipants(conversationId: number): Promise<NotifiableParticipant[]>;
  findDisplayName(userId: number): Promise<string | null>;
  /** Remembers when the participant was last emailed, so one unread burst sends one email. */
  markNotified(participantId: number, notifiedAt: Date): Promise<void>;
}
