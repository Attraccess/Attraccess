// typeorm.config.ts

import { DataSource, DataSourceOptions } from 'typeorm';
import { resolveDatabasePath } from '../config/storage-path';
import { entities } from '@attraccess/database-entities';
import * as migrations from './migrations';
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
  type: 'sqlite',
  database: dbFile,
} as DataSourceOptions;

export const dataSourceConfig = dbConfig;

export default new DataSource(dataSourceConfig as DataSourceOptions);
