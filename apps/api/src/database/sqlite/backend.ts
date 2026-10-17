import { seedSQLiteDevelopmentData, checkSQLiteUsageIntegrity } from './seed';
import type { DevelopmentSeedData } from '../tooling';
import { DataSource, DataSourceOptions } from 'typeorm';
import { DatabaseBackend } from '../backend';
import { SqliteBackendConfig } from '../backend.config';
import { sqliteSchema } from './schema';
import { SqliteDatabaseErrors } from './errors';

export class SqliteBackend implements DatabaseBackend {
  readonly type = 'sqlite';
  readonly capabilities = { independentWriters: false, fileBacked: true } as const;
  readonly errors = new SqliteDatabaseErrors();

  constructor(private readonly config: SqliteBackendConfig) {}

  /** Only persistence composition and the legacy migration CLI consume ORM options. */
  connectionOptions(): DataSourceOptions {
    return {
      ...sqliteSchema,
      type: 'sqlite',
      database: this.config.database,
      synchronize: false,
      // Settings are read while Nest constructs the application.
      migrationsRun: true,
    };
  }

  seedDevelopmentData(database: string, input: DevelopmentSeedData): Promise<{ userId: number }> {
    return seedSQLiteDevelopmentData(database, input);
  }

  checkUsageIntegrity(database: string): Promise<void> {
    return checkSQLiteUsageIntegrity(database);
  }

  createConnection(): DataSource {
    return new DataSource(this.connectionOptions());
  }
}

/** Internal record projection: retain exact scalars and loaded relations, without ORM prototypes. */
export function toApplicationRecord<T>(input: T): T {
  const seen = new WeakMap<object, object>();
  const copy = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object' || value instanceof Date || ArrayBuffer.isView(value)) return value;
    const existing = seen.get(value);
    if (existing) return existing;
    if (Array.isArray(value)) {
      const array: unknown[] = [];
      seen.set(value, array);
      for (const item of value) array.push(copy(item));
      return array;
    }
    const record: Record<string, unknown> = {};
    seen.set(value, record);
    for (const key of Object.keys(value)) {
      Object.defineProperty(record, key, {
        value: copy(Reflect.get(value, key)),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return record;
  };
  return copy(input) as T;
}
