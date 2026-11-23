import { Module } from '@nestjs/common';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthController } from './resource-health.controller';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceHealthNotificationListener } from './resource-health-notification.listener';
import { NotificationsModule } from '../../notifications/notifications.module';
import { RbacModule } from '../../users-and-auth/rbac/rbac.module';
import { HealthPersistenceModule } from '../../database/adapters/resources/health-persistence.module';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';

@Module({
  imports: [
    ResourceListVisibilityModule,
    HealthPersistenceModule,
    ResourceMaintenanceModule,
    NotificationsModule,
    RbacModule,
  ],
  controllers: [ResourceHealthController],
  providers: [ResourceHealthService, ResourceHealthNotificationListener],
  exports: [ResourceHealthService],
})
export class ResourceHealthModule {}
