import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceBillingConfiguration,
  ResourceMeter,
  Setting,
  User,
} from '@attraccess/database-entities';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BILLING_CONFIGURATION_STORE } from '../../../billing/ports/billing-configuration.port';
import { BILLING_LEDGER_STORE } from '../../../billing/ports/billing-ledger.port';
import { SUMUP_CREDENTIAL_STORE } from '../../../billing/ports/sumup-credentials.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmBillingConfigurationStore } from './typeorm-billing-configuration.store';
import { TypeOrmBillingLedgerStore } from './typeorm-billing-ledger.store';
import { TypeOrmSumUpCredentialStore } from './typeorm-sumup-credential.store';

/** Provides the billing ports with the TypeORM adapters. The audit recorder port is global. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingTransaction,
      BillingTransactionItem,
      ResourceBillingConfiguration,
      ResourceMeter,
      Setting,
      User,
    ]),
    UnitOfWorkModule,
  ],
  providers: [
    { provide: BILLING_LEDGER_STORE, useClass: TypeOrmBillingLedgerStore },
    { provide: BILLING_CONFIGURATION_STORE, useClass: TypeOrmBillingConfigurationStore },
    { provide: SUMUP_CREDENTIAL_STORE, useClass: TypeOrmSumUpCredentialStore },
  ],
  exports: [BILLING_LEDGER_STORE, BILLING_CONFIGURATION_STORE, SUMUP_CREDENTIAL_STORE, UnitOfWorkModule],
})
export class BillingPersistenceModule {}
