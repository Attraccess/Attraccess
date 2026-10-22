import { User } from './user';
import { Conversation } from './conversation';

export enum MessageReferenceType {
  RESOURCE = 'RESOURCE',
  ACTIVITY = 'ACTIVITY',
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  referenceType: MessageReferenceType | null;
  referenceId: number | null;
  referenceLabel: string | null;
  referenceUrl: string | null;
  createdAt: Date;
  conversation: Conversation;
  sender: User;
}
