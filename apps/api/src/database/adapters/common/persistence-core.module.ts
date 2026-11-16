import { Global, Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { UNIT_OF_WORK } from '../../unit-of-work';
import { TransactionHandles } from './transaction-handles';

/**
 * Provides the selected backend's unit of work and the adapters' access to the transaction behind a scope. Imported
 * once by the application module; every persistence module of an area relies on it.
 */
@Global()
@Module({
  providers: [
    {
      provide: UNIT_OF_WORK,
      inject: [getDataSourceToken()],
      useFactory: (source: DataSource) => unitOfWorkFor(source),
    },
    TransactionHandles,
  ],
  exports: [UNIT_OF_WORK, TransactionHandles],
})
export class PersistenceCoreModule {}
