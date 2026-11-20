import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, ConversationParticipant, Message, Resource, User } from '@attraccess/database-entities';
import { CONVERSATION_STORE } from '../../../messaging/conversation-store.port';
import { MESSAGE_NOTIFICATION_STORE } from '../../../messaging/message-notification-store.port';
import { TypeOrmConversationStore } from './typeorm-conversation-store';
import { TypeOrmMessageNotificationStore } from './typeorm-message-notification-store';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, Resource, User])],
  providers: [
    { provide: CONVERSATION_STORE, useClass: TypeOrmConversationStore },
    { provide: MESSAGE_NOTIFICATION_STORE, useClass: TypeOrmMessageNotificationStore },
  ],
  exports: [CONVERSATION_STORE, MESSAGE_NOTIFICATION_STORE],
})
export class MessagingPersistenceModule {}
