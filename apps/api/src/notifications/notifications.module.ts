import { Module } from '@nestjs/common';
import { NotificationsPersistenceModule } from '../database/adapters/notifications/notifications-persistence.module';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationsController } from './notifications.controller';
import { NotificationLiveService } from './notification-live.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PushModule } from '../push/push.module';
import { MetricsModule } from '../metrics/metrics.module';
import { EmailModule } from '../email/email.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { NotificationLiveTopicsProvider } from './notification-live-topics.provider';
import { SettingsModule } from '../settings/settings.module';
import { EmailPersistenceModule } from '../database/adapters/email/email-persistence.module';

@Module({
  imports: [
    NotificationsPersistenceModule,
    EmailPersistenceModule,
    PushModule,
    MetricsModule,
    EmailModule,
    SettingsModule,
    LiveTopicsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationPreferenceService,
    NotificationLiveService,
    NotificationDispatchService,
    NotificationLiveTopicsProvider,
  ],
  exports: [NotificationPreferenceService, NotificationDispatchService, NotificationLiveService],
})
export class NotificationsModule {}
