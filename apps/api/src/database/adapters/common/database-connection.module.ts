import { EventEmitter } from 'node:events';
import { Module } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseBackend, dataSourceConfig } from '../../datasource';
import { DATABASE_LIFECYCLE } from '../../database-lifecycle';
import { PersistenceCoreModule } from './persistence-core.module';

/**
 * Opens the application connection of the selected backend (see database/backend) and provides what the rest of
 * the application consumes of it: the unit of work and the database lifecycle. Feature modules import their own
 * persistence module (database/adapters/<area>) and never the connection.
 */
/**
 * The Swagger and AsyncAPI export builds the whole application without a database (SKIP_DATABASE_MIGRATIONS=true and no
 * DATABASE_URL, e.g. inside the image build): the entity metadata is enough and every statement answers with an empty
 * result, so nothing connects and settings read as unset.
 */
function offlineIfExporting(source: DataSource): DataSource {
  if (process.env.SKIP_DATABASE_MIGRATIONS !== 'true' || process.env.DATABASE_URL) return source;
  const internals = source as unknown as { buildMetadatas(): Promise<void>; isInitialized: boolean };
  const driver = source.driver as unknown as { obtainMasterConnection(): Promise<unknown> };
  const empty = { command: 'SELECT', rowCount: 0, rows: [], fields: [] };
  const connection = Object.assign(new EventEmitter(), {
    query: (_sql: string, _params: unknown, done?: (error: Error | null, result: unknown) => void) =>
      done ? done(null, empty) : Promise.resolve(empty),
  });
  driver.obtainMasterConnection = async () => [connection, () => undefined];
  source.initialize = async () => {
    await internals.buildMetadatas();
    internals.isInitialized = true;
    return source;
  };
  return source;
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => dataSourceConfig,
      // The main connection shares the database file with the resource-lifecycle and audit connections.
      dataSourceFactory: async (options) => offlineIfExporting(databaseBackend.createDataSource(options as DataSourceOptions)),
    }),
    PersistenceCoreModule,
  ],
  providers: [{ provide: DATABASE_LIFECYCLE, useExisting: getDataSourceToken() }],
  exports: [DATABASE_LIFECYCLE],
})
export class DatabaseConnectionModule {}
