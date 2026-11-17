// typeorm.config.ts

// TypeORM loads the driver at runtime; the static import makes the generated package.json ship it.
import 'better-sqlite3';
import { DataSourceOptions } from 'typeorm';
import { resolveDatabasePath } from '../config/storage-path';
import { entities } from '@attraccess/database-entities';
import * as migrations from './migrations';
import { createDataSource } from './sqlite-connection';
import { Logger } from '@nestjs/common';

const dbFile = resolveDatabasePath();

new Logger('Database').log(`dbFile ${dbFile}`);

const dbConfig: Partial<DataSourceOptions> = {
  synchronize: false,
  migrations: Object.values(migrations),
  migrationsTableName: 'migrations',
  // Providers access database-backed settings while Nest constructs AppModule.
  migrationsRun: true,
  entities: Object.values(entities),
  type: 'better-sqlite3',
  database: dbFile,
  // TypeORM 1.0 throws on null/undefined values in find-option where clauses; 0.3 skipped them. Keep 0.3's behaviour
  // so code that passes an optional filter does not start failing at runtime.
  invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
} as DataSourceOptions;

export const dataSourceConfig = dbConfig;

export default createDataSource(dataSourceConfig as DataSourceOptions);
