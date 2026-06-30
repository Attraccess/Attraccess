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

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference]), PushModule, MetricsModule, EmailModule],
  controllers: [NotificationsController],
  providers: [NotificationPreferenceService, NotificationLiveService, NotificationDispatchService],
  exports: [NotificationPreferenceService, NotificationDispatchService],
})
export class NotificationsModule {}
