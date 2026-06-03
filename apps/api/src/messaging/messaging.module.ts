import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  ConversationParticipant,
  Message,
  NotificationPreference,
  Resource,
  User,
} from '@attraccess/database-entities';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessagingController } from './messaging.controller';
import { MessageNotificationListener } from './message-notification.listener';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, NotificationPreference, Resource, User]),
    ResourceUsageModule,
    EmailModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingLiveService, MessageNotificationListener],
  exports: [MessagingService],
})
export class MessagingModule {}
