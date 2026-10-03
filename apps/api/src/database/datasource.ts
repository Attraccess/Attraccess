// typeorm.config.ts

import { DataSource, DataSourceOptions } from 'typeorm';
import { loadEnv } from '@attraccess/env';
import { join, resolve } from 'path';
import { entities } from '@attraccess/database-entities';
import * as migrations from './migrations';
import { Logger } from '@nestjs/common';

const storageEnv = loadEnv((z) => ({ STORAGE_ROOT: z.string().default(join(process.cwd(), 'storage')) }));
const dbFile = resolve(join(storageEnv.STORAGE_ROOT, 'attraccess.sqlite'));

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
