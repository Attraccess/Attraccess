import { Module } from '@nestjs/common';
import { ResourceUsageController } from './sessions/resource-usage.controller';
import { ResourceUsageService } from './sessions/resource-usage.service';
import { ResourceActivityVisibilityService } from './authorization/resource-activity-visibility.service';
import { SettingsModule } from '../../settings/settings.module';
import { HealthPersistenceModule } from '../../database/adapters/resources/health-persistence.module';
import { RbacModule } from '../../users-and-auth/rbac/rbac.module';
import { ResourceUsageNoteNotificationListener } from './notifications/notes.listener';
import { ResourceSessionNotificationListener } from './notifications/session.listener';
import { SupervisedUsageAutoPromotionListener } from './sessions/supervised-usage-auto-promotion.listener';
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
import { ResourceTransactionsModule } from '../../database/resource-transactions.module';
import { UsagePersistenceModule } from '../../database/adapters/usage/usage-persistence.module';
import { ResourceMeteringModule } from '../metering/resource-metering.module';
import { ReaderUiModule } from '../../plugin-system/reader-ui/reader-ui.module';
import { PreStartService } from './pre-start/pre-start.service';
import { SessionEndNotifier } from './pre-start/session-end-notifier.service';
import { WebStartStepStore } from './pre-start/web-start-step.store';
import { RESOURCE_USAGE_COLLABORATORS } from './resource-usage.collaborators';
import { ResourceUsageFlowsBridge } from './sessions/resource-usage-flows.bridge';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';
import { SessionAutoEndService } from './session-duration/session-auto-end.service';

@Module({
  imports: [
    ResourceListVisibilityModule,
    ResourceTransactionsModule,
    UsagePersistenceModule,
    HealthPersistenceModule,
    RbacModule,
    SettingsModule,
    NotificationsModule,
    ResourceIntroducersModule,
    ResourceIntroductionsModule,
    ResourceGroupsModule,
    ResourceRetrainingModule,
    ResourceMaintenanceModule,
    BillingModule,
    ResourceFlowsModule,
    ResourceMeteringModule,
    ProjectsModule,
    ResourceFormsModule,
    ResourceHealthModule,
    ResourceOperatingIntervalModule,
    ReaderUiModule,
  ],
  controllers: [ResourceUsageController],
  providers: [
    ResourceUsageService,
    ...RESOURCE_USAGE_COLLABORATORS,
    ResourceUsageNoteNotificationListener,
    ResourceSessionNotificationListener,
    SupervisedUsageAutoPromotionListener,
    ResourceActivityVisibilityService,
    PreStartService,
    WebStartStepStore,
    SessionEndNotifier,
    ResourceUsageFlowsBridge,
    SessionAutoEndService,
  ],
  exports: [ResourceUsageService, ResourceActivityVisibilityService, PreStartService, SessionEndNotifier],
})
export class ResourceUsageModule {}
