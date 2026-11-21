import 'better-sqlite3';
import { DataSource, DataSourceOptions } from 'typeorm';

/** How long a statement waits for the SQLite write lock. The import runs while the API is not serving: nobody else writes. */
const SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * A plain better-sqlite3 DataSource on one file, for the SQLite -> PostgreSQL import only
 * (PostgresImportSqlite1760000000001): no entities (the entity library describes the PostgreSQL schema) and no
 * migrations of its own; the caller supplies the frozen track.
 */
export function createSqliteSource(file: string, extra: Partial<DataSourceOptions> = {}): DataSource {
  return new DataSource({
    type: 'better-sqlite3',
    database: file,
    entities: [],
    synchronize: false,
    migrationsRun: false,
    timeout: SQLITE_BUSY_TIMEOUT_MS,
    invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
    ...extra,
  } as DataSourceOptions);
}
