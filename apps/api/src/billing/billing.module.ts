import {
  BillingTransaction,
  ResourceBillingConfiguration,
  Setting,
  User,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SumUpService } from './sumup.service';
import { LiveNotificationsService } from './liveNotificationsService';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';
import { EmailModule } from '../email/email.module';
import { SettingsModule } from '../settings/settings.module';
import { LicenseModule } from '../license/license.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { BillingLiveTopicsProvider } from './billing-live-topics.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([BillingTransaction, User, ResourceBillingConfiguration, Setting, BillingTransactionItem]),
    forwardRef(() => ResourceFlowsModule),
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
