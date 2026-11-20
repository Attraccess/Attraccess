import { Module } from '@nestjs/common';
import { USAGE_SESSION_STORE } from '../../../resources/usage/usage-session-store.port';
import { ResourceTransactionsModule } from '../../resource-transactions.module';
import { TypeOrmUsageSessionStore } from './typeorm-usage-session.store';

/** Provides the usage session port with its TypeORM adapter. */
@Module({
  imports: [ResourceTransactionsModule],
  providers: [TypeOrmUsageSessionStore, { provide: USAGE_SESSION_STORE, useExisting: TypeOrmUsageSessionStore }],
  exports: [USAGE_SESSION_STORE],
})
export class UsagePersistenceModule {}
