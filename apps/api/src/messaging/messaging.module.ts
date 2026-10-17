import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, ConversationParticipant, Message, Resource, User } from '@attraccess/database-entities';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessagingController } from './messaging.controller';
import { MessageNotificationListener } from './message-notification.listener';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { MessagingLiveTopicsProvider } from './messaging-live-topics.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, Resource, User]),
    ResourceUsageModule,
    SettingsModule,
    NotificationsModule,
    LiveTopicsModule,
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    MessagingLiveService,
    MessageNotificationListener,
    MessageRateLimitService,
    MessagingLiveTopicsProvider,
  ],
  exports: [MessagingService, MessagingLiveService],
})
export class MessagingModule {}
