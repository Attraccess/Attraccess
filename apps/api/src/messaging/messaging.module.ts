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
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, NotificationPreference, Resource, User]),
    ResourceUsageModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingLiveService, MessageNotificationListener, MessageRateLimitService],
  exports: [MessagingService],
})
export class MessagingModule {}
