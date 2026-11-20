import { Module } from '@nestjs/common';
import { OPERATING_TIMELINE_STORE } from '../../../resources/operating-intervals/operating-timeline.port';
import { ResourceTransactionsModule } from '../../resource-transactions.module';
import { TypeOrmOperatingTimelineStore } from './typeorm-operating-timeline.store';

/** Provides the operating timeline port with its TypeORM adapter. */
@Module({
  imports: [ResourceTransactionsModule],
  providers: [
    TypeOrmOperatingTimelineStore,
    { provide: OPERATING_TIMELINE_STORE, useExisting: TypeOrmOperatingTimelineStore },
  ],
  exports: [OPERATING_TIMELINE_STORE],
})
export class OperatingIntervalsPersistenceModule {}
