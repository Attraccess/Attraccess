import { Module } from '@nestjs/common';
import { MessagingPersistenceModule } from '../database/adapters/messaging/messaging-persistence.module';
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
import { ResourceListVisibilityModule } from '../resources/visibility/resource-list-visibility.module';

@Module({
  imports: [
    MessagingPersistenceModule,
    ResourceUsageModule,
    SettingsModule,
    NotificationsModule,
    LiveTopicsModule,
    ResourceListVisibilityModule,
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
