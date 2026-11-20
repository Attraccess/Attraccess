import { Module } from '@nestjs/common';
import { METERING_STORE } from '../../../resources/metering/metering-store.port';
import { ResourceTransactionsModule } from '../../resource-transactions.module';
import { TypeOrmMeteringStore } from './typeorm-metering.store';

/** Provides the metering port with its TypeORM adapter. */
@Module({
  imports: [ResourceTransactionsModule],
  providers: [TypeOrmMeteringStore, { provide: METERING_STORE, useExisting: TypeOrmMeteringStore }],
  exports: [METERING_STORE],
})
export class MeteringPersistenceModule {}
