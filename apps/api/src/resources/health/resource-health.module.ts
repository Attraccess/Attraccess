import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceHealthState, ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthController } from './resource-health.controller';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceHealthNotificationListener } from './resource-health-notification.listener';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceHealthState, Resource, ResourceIntroducer, User]),
    ResourceMaintenanceModule,
    NotificationsModule,
  ],
  controllers: [ResourceHealthController],
  providers: [ResourceHealthService, ResourceHealthNotificationListener],
  exports: [ResourceHealthService],
})
export class ResourceHealthModule {}
