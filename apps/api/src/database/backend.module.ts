import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { selectDatabaseBackend } from './backend.registry';
import { DatabaseErrors } from './backend';
import { DataSource } from 'typeorm';
import { DatabaseTransactions } from './transaction-scope';
import { SqliteTransactionDriver } from './sqlite/transactions';

const backend = selectDatabaseBackend();

/** Application composition owns wiring; features receive operation ports. */
@Global()
@Module({
  imports: [TypeOrmModule.forRoot(backend.connectionOptions())],
  providers: [
    { provide: DatabaseErrors, useValue: backend.errors },
    {
      provide: SqliteTransactionDriver,
      useFactory: (source: DataSource) => new SqliteTransactionDriver(source),
      inject: [DataSource],
    },
    {
      provide: DatabaseTransactions,
      useFactory: (driver: SqliteTransactionDriver) => new DatabaseTransactions(driver),
      inject: [SqliteTransactionDriver],
    },
  ],
  exports: [DatabaseErrors, DatabaseTransactions, SqliteTransactionDriver],
})
export class DatabaseBackendModule {}
