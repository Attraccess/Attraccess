import { entities } from '@attraccess/database-entities';
import * as migrations from '../migrations';

/** Released SQLite schema identities and export ordering must remain stable. */
export const sqliteSchema = {
  entities: Object.values(entities),
  migrations: Object.values(migrations),
  migrationsTableName: 'migrations',
};
