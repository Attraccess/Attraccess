import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './charges/billing.service';
import { SumUpService } from './sumup/sumup.service';
import { LiveNotificationsService } from './live-notifications/live-notifications.service';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';
import { EmailModule } from '../email/email.module';
import { SettingsModule } from '../settings/settings.module';
import { LicenseModule } from '../license/license.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { BillingLiveTopicsProvider } from './live-notifications/billing-live-topics.provider';
import { BillingPersistenceModule } from '../database/adapters/billing/billing-persistence.module';
import { ResourceListVisibilityModule } from '../resources/visibility/resource-list-visibility.module';

@Module({
  imports: [
    ResourceListVisibilityModule,
    BillingPersistenceModule,
    ResourceFlowsModule,
    EmailModule,
    SettingsModule,
    LicenseModule,
    LiveTopicsModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, SumUpService, LiveNotificationsService, BillingLiveTopicsProvider],
  exports: [BillingService, SumUpService, LiveNotificationsService],
})
export class BillingModule {}
