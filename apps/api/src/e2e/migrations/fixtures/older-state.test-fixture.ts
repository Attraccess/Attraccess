import type { DataSource } from 'typeorm';

/**
 * A representative older released state of a deployment. Each one is built by migrating a fresh database only up to
 * `timestamp` (so the schema is exactly what that release created), writing data with plain SQL in the columns that
 * release knew, and, after the remaining migrations ran, checking that this data survived with identical values.
 * Nothing here edits a released migration.
 */
export interface OlderState {
  readonly name: string;
  /** Class timestamp of the last migration this release had applied. */
  readonly timestamp: number;
  seed(source: DataSource): Promise<void>;
  /** Runs against the fully migrated database: raw SQL, and reads through the application's adapters. */
  verify(source: DataSource): Promise<void>;
}

export const rows = <T = Record<string, unknown>>(
  source: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => source.query(sql, params);
