import { Module } from '@nestjs/common';
import { SESSION_DEADLINE_STORE } from '../../../resources/usage/session-duration/session-deadline-store.port';
import { USAGE_SESSION_STORE } from '../../../resources/usage/usage-session-store.port';
import { ResourceTransactionsModule } from '../../resource-transactions.module';
import { TypeOrmSessionDeadlineStore } from './typeorm-session-deadline.store';
import { TypeOrmUsageSessionStore } from './typeorm-usage-session.store';

/** Provides the usage session and session deadline ports with their TypeORM adapters. */
@Module({
  imports: [ResourceTransactionsModule],
  providers: [
    TypeOrmUsageSessionStore,
    { provide: USAGE_SESSION_STORE, useExisting: TypeOrmUsageSessionStore },
    TypeOrmSessionDeadlineStore,
    { provide: SESSION_DEADLINE_STORE, useExisting: TypeOrmSessionDeadlineStore },
  ],
  exports: [USAGE_SESSION_STORE, SESSION_DEADLINE_STORE],
})
export class UsagePersistenceModule {}
