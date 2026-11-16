// typeorm.config.ts

import { DataSourceOptions } from 'typeorm';
import { Logger } from '@nestjs/common';
import { resolveDatabaseBackend } from './backend';

// Resolving the backend first makes an unsupported DATABASE_TYPE fail before any connection or migration.
const backend = resolveDatabaseBackend();
const dbConfig = backend.createDataSourceOptions();

new Logger('Database').log(`backend ${backend.type}`);

export const databaseBackend = backend;
export const dataSourceConfig: Partial<DataSourceOptions> = dbConfig;

export default backend.createDataSource(dataSourceConfig as DataSourceOptions);
