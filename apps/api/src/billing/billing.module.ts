import { DataSource } from 'typeorm';
import { SqliteTransactionDriver } from '../database/sqlite/transactions';
import { SumupPersistence, BillingLivePersistence, BillingPersistence, BILLING_OPERATIONS } from './persistence/port';
import {
  TypeormSumupPersistence,
  TypeormBillingLivePersistence,
  TypeormBillingPersistence,
} from './persistence/typeorm-adapter';
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
import { BillingService } from './charges/billing.service';
import { SumUpService } from './sumup/sumup.service';
import { LiveNotificationsService } from './live-notifications/live-notifications.service';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';
import { EmailModule } from '../email/email.module';
import { SettingsModule } from '../settings/settings.module';
import { LicenseModule } from '../license/license.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { BillingLiveTopicsProvider } from './live-notifications/billing-live-topics.provider';

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
  providers: [
    {
      provide: BillingPersistence,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        driver.register(BILLING_OPERATIONS, (manager) => new TypeormBillingPersistence(manager));
        return new TypeormBillingPersistence(source.manager);
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    { provide: SumupPersistence, useClass: TypeormSumupPersistence },
    { provide: BillingLivePersistence, useClass: TypeormBillingLivePersistence },
    BillingService,
    SumUpService,
    LiveNotificationsService,
    BillingLiveTopicsProvider,
  ],
  exports: [BillingService, SumUpService, LiveNotificationsService],
})
export class BillingModule {}
