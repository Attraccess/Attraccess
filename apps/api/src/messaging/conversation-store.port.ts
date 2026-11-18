import type {
  ConversationParticipation,
  ConversationRecord,
  MessageRecord,
  MessagingUser,
  NewMessage,
} from '@attraccess/application-models';

/** Persistence of 1:1 conversations, their messages and each participant's read state. */
export const CONVERSATION_STORE = Symbol.for('attraccess.messaging.conversation-store');

export interface ConversationStore {
  isParticipant(conversationId: number, userId: number): Promise<boolean>;
  /** Marks everything up to `readAt` as read for the participant. */
  markRead(conversationId: number, userId: number, readAt: Date): Promise<void>;
  /** The conversations the user takes part in, with their read state. */
  listParticipations(userId: number): Promise<ConversationParticipation[]>;
  /** Messages of others in the conversation newer than `lastReadAt` (all of them when it is null). */
  countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number>;
  userExists(userId: number): Promise<boolean>;
  /** The oldest conversation that has exactly these two participants. */
  findOneToOneConversation(userIdA: number, userIdB: number): Promise<ConversationRecord | null>;
  /** Creates the conversation and both participant entries atomically. */
  createOneToOneConversation(userIdA: number, userIdB: number): Promise<ConversationRecord>;
  /** The display name of a resource a message may reference, or null when it does not exist. */
  findResourceName(resourceId: number): Promise<string | null>;
  /** Stores the message and bumps the conversation's update time. */
  appendMessage(message: NewMessage): Promise<MessageRecord>;
  findLastMessage(conversationId: number): Promise<MessageRecord | null>;
  findMessageWithSender(messageId: number): Promise<MessageRecord | null>;
  findOtherParticipant(conversationId: number, userId: number): Promise<MessagingUser | null>;
  /** One page of messages, newest first, with their senders. */
  pageMessages(conversationId: number, page: number, limit: number): Promise<{ data: MessageRecord[]; total: number }>;
  participantUserIds(conversationId: number): Promise<number[]>;
}
