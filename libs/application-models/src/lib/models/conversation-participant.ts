import { User } from './user';
import { Conversation } from './conversation';

export interface ConversationParticipant {
  id: number;
  conversationId: number;
  userId: number;
  lastReadAt: Date | null;
  lastNotifiedAt: Date | null;
  conversation: Conversation;
  user: User;
}
