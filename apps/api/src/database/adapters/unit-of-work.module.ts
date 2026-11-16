import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createSqliteUnitOfWork } from '../sqlite/sqlite-unit-of-work';
import { UNIT_OF_WORK } from '../unit-of-work';
import { TransactionContextResolver } from './transaction-context';

/** Provides the application's single UnitOfWork (token UNIT_OF_WORK) and the resolver adapters use to join it. */
@Module({
  providers: [
    {
      provide: UNIT_OF_WORK,
      inject: [getDataSourceToken()],
      useFactory: (source: DataSource) => createSqliteUnitOfWork(source),
    },
    TransactionContextResolver,
  ],
  exports: [UNIT_OF_WORK, TransactionContextResolver],
})
export class UnitOfWorkModule {}
