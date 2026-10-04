import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationPreference } from '@attraccess/database-entities';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationsController } from './notifications.controller';
import { NotificationLiveService } from './notification-live.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PushModule } from '../push/push.module';
import { MetricsModule } from '../metrics/metrics.module';
import { EmailModule } from '../email/email.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { NotificationLiveTopicsProvider } from './notification-live-topics.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationPreference]),
    PushModule,
    MetricsModule,
    EmailModule,
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
