import { Module } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { databaseBackend, dataSourceConfig } from '../../datasource';
import { DATABASE_LIFECYCLE } from '../../database-lifecycle';
import { PersistenceCoreModule } from './persistence-core.module';

/**
 * Opens the application connection of the selected backend (see database/backend) and provides what the rest of
 * the application consumes of it: the unit of work and the database lifecycle. Feature modules import their own
 * persistence module (database/adapters/<area>) and never the connection.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => dataSourceConfig,
      // The main connection shares the database file with the resource-lifecycle and audit connections.
      dataSourceFactory: async (options) => databaseBackend.createDataSource(options as DataSourceOptions),
    }),
    PersistenceCoreModule,
  ],
  providers: [{ provide: DATABASE_LIFECYCLE, useExisting: getDataSourceToken() }],
  exports: [DATABASE_LIFECYCLE],
})
export class DatabaseConnectionModule {}
