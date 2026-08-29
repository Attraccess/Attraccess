import { Module, forwardRef } from '@nestjs/common';
import { ResourceUsageController } from './resourceUsage.controller';
import { ResourceUsageService } from './resourceUsage.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceIntroducer, ResourceUsage, User } from '@attraccess/database-entities';
import { RbacModule } from '../../users-and-auth/rbac/rbac.module';
import { ResourceUsageNoteNotificationListener } from './resource-usage-note-notification.listener';
import { ResourceSessionNotificationListener } from './resource-session-notification.listener';
import { SupervisedUsageAutoPromotionListener } from './supervised-usage-auto-promotion.listener';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { ResourceIntroductionsModule } from '../introductions/resourceIntroductions.module';
import { ResourceGroupsModule } from '../groups/resourceGroups.module';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { BillingModule } from '../../billing/billing.module';
import { ResourceFlowsModule } from '../flows/resource-flows.module';
import { ProjectsModule } from '../../projects/projects.module';
import { ResourceFormsModule } from '../forms/forms.module';
import { ResourceHealthModule } from '../health/resource-health.module';
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';
import { ResourceOperatingIntervalModule } from '../operating-intervals/resource-operating-interval.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceUsage, Resource, ResourceIntroducer, User]),
    RbacModule,
    NotificationsModule,
    ResourceIntroducersModule,
    ResourceIntroductionsModule,
    ResourceGroupsModule,
    ResourceRetrainingModule,
    ResourceMaintenanceModule,
    forwardRef(() => BillingModule),
    forwardRef(() => ResourceFlowsModule),
    forwardRef(() => ProjectsModule),
    ResourceFormsModule,
    ResourceHealthModule,
    ResourceOperatingIntervalModule,
  ],
  controllers: [ResourceUsageController],
  providers: [
    ResourceUsageService,
    ResourceUsageNoteNotificationListener,
    ResourceSessionNotificationListener,
    SupervisedUsageAutoPromotionListener,
  ],
  exports: [ResourceUsageService],
})
export class ResourceUsageModule {}
