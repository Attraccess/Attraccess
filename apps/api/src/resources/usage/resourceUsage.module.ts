import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { UsageNoteRecipients, SupervisedUsageHistory, UsagePersistence, USAGE_OPERATIONS } from './persistence/port';
import {
  TypeormUsageNoteRecipients,
  TypeormSupervisedUsageHistory,
  TypeormUsagePersistence,
} from './persistence/typeorm-adapter';
import { Module, forwardRef } from '@nestjs/common';
import { ResourceUsageController } from './sessions/resource-usage.controller';
import { ResourceUsageService } from './sessions/resource-usage.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceIntroducer, ResourceUsage, User } from '@attraccess/database-entities';
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
import { ResourceMeteringModule } from '../metering/resource-metering.module';

@Module({
  imports: [
    ResourceTransactionsModule,
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
    forwardRef(() => ResourceMeteringModule),
    forwardRef(() => ProjectsModule),
    ResourceFormsModule,
    ResourceHealthModule,
    ResourceOperatingIntervalModule,
  ],
  controllers: [ResourceUsageController],
  providers: [
    {
      provide: UsagePersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(USAGE_OPERATIONS, (manager) => new TypeormUsagePersistence(manager));
        return new TypeormUsagePersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    ResourceUsageService,
    ResourceUsageNoteNotificationListener,
    { provide: UsageNoteRecipients, useClass: TypeormUsageNoteRecipients },
    ResourceSessionNotificationListener,
    SupervisedUsageAutoPromotionListener,
    { provide: SupervisedUsageHistory, useClass: TypeormSupervisedUsageHistory },
  ],
  exports: [ResourceUsageService],
})
export class ResourceUsageModule {}
