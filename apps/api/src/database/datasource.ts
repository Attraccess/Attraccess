// typeorm.config.ts

import { DataSource, DataSourceOptions } from 'typeorm';
import { loadEnv } from '@attraccess/env';
import { join, resolve } from 'path';
import { entities } from '@attraccess/database-entities';
import * as migrations from './migrations';

const storageEnv = loadEnv((z) => ({ STORAGE_ROOT: z.string().default(join(process.cwd(), 'storage')) }));
const dbFile = resolve(join(storageEnv.STORAGE_ROOT, 'attraccess.sqlite'));

console.log('dbFile', dbFile);

const dbConfig: Partial<DataSourceOptions> = {
  synchronize: false,
  migrations: Object.values(migrations),
  migrationsTableName: 'migrations',
  migrationsRun: true,
  entities: Object.values(entities),
  type: 'sqlite',
  database: dbFile,
} as DataSourceOptions;

export const dataSourceConfig = dbConfig;

export default new DataSource(dataSourceConfig as DataSourceOptions);
