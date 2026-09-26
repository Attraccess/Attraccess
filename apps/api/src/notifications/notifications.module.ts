import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardPin, NotificationPreference, Resource } from '@attraccess/database-entities';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationsController } from './notifications.controller';
import { NotificationLiveService } from './notification-live.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PushModule } from '../push/push.module';
import { MetricsModule } from '../metrics/metrics.module';
import { EmailModule } from '../email/email.module';
import { DashboardPinsController } from './dashboard-pins.controller';
import { DashboardPinsService } from './dashboard-pins.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference, DashboardPin, Resource]), PushModule, MetricsModule, EmailModule],
  controllers: [NotificationsController, DashboardPinsController],
  providers: [NotificationPreferenceService, NotificationLiveService, NotificationDispatchService, DashboardPinsService],
  exports: [NotificationPreferenceService, NotificationDispatchService],
})
export class NotificationsModule {}
