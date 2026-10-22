import type { Conversation, ConversationParticipant, Message, Resource, User } from '@attraccess/application-models';
export type NewMessage = Pick<
  Message,
  'conversationId' | 'senderId' | 'content' | 'referenceType' | 'referenceId' | 'referenceLabel' | 'referenceUrl'
>;
export abstract class MessagingLivePersistence {
  abstract messageWithSender(id: number): Promise<Message | null>;
  abstract participants(conversationId: number): Promise<ConversationParticipant[]>;
}
export abstract class MessagingPersistence extends MessagingLivePersistence {
  abstract markRead(conversationId: number, userId: number, at: Date): Promise<void>;
  abstract userParticipations(userId: number, withConversation: boolean): Promise<ConversationParticipant[]>;
  abstract findParticipant(conversationId: number, userId: number): Promise<ConversationParticipant | null>;
  abstract findUser(userId: number): Promise<User | null>;
  abstract createPair(userIdA: number, userIdB: number): Promise<Conversation>;
  abstract findPair(userIdA: number, userIdB: number): Promise<Conversation | null>;
  abstract storeMessage(message: NewMessage): Promise<Message>;
  abstract touchConversation(conversationId: number, at: Date): Promise<void>;
  abstract lastMessage(conversationId: number): Promise<Message | null>;
  abstract messagePage(conversationId: number, page: number, limit: number): Promise<[Message[], number]>;
  abstract countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number>;
  abstract otherParticipant(conversationId: number, userId: number): Promise<User | null>;
  abstract findResource(resourceId: number): Promise<Resource | null>;
}

export abstract class MessageNotificationPersistence {
  abstract participantsWithUsers(conversationId: number): Promise<ConversationParticipant[]>;
  abstract sender(userId: number): Promise<User | null>;
  abstract markNotified(participantId: number, at: Date): Promise<void>;
}
