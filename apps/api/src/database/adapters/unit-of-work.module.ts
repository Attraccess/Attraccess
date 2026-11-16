import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UNIT_OF_WORK } from '../unit-of-work';
import { createSqliteUnitOfWork } from '../sqlite/sqlite-unit-of-work';

/**
 * Provides the one UnitOfWork of the application connection. Every persistence module of an area imports this
 * module, so all adapters share one instance: a scope can only be unwrapped by the unit of work that created it.
 */
@Module({
  providers: [
    {
      provide: UNIT_OF_WORK,
      inject: [getDataSourceToken()],
      useFactory: (source: DataSource) => createSqliteUnitOfWork(source),
    },
  ],
  exports: [UNIT_OF_WORK],
})
export class UnitOfWorkModule {}
