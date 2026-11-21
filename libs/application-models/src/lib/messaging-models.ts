import type { MessageReferenceType } from './message';

/** The public part of an account as other participants of a conversation see it. */
export interface MessagingUser {
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
  deletedAt?: Date | null;
  externalIdentifier: string | null;
  creditBalance: number;
  billingFactor: number;
}

export interface ConversationRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  referenceType: MessageReferenceType | null;
  referenceId: number | null;
  referenceLabel: string | null;
  referenceUrl: string | null;
  createdAt: Date;
  /** Present when the message was read together with its sender. */
  sender?: MessagingUser;
}

export interface NewMessage {
  conversationId: number;
  senderId: number;
  content: string;
  referenceType: MessageReferenceType | null;
  referenceId: number | null;
  referenceLabel: string | null;
  referenceUrl: string | null;
}

/** One user's membership of a conversation with the state of their inbox. */
export interface ConversationParticipation {
  participantId: number;
  conversationId: number;
  userId: number;
  lastReadAt: Date | null;
  lastNotifiedAt: Date | null;
  conversationUpdatedAt: Date;
}
