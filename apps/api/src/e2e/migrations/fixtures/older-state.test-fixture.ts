import type { DataSource } from 'typeorm';
import type { PluginDescriptor } from '../../../database/transfer-snapshot';

/**
 * A representative older released state of a SQLite deployment. Each one is built by migrating a fresh SQLite file only
 * up to `timestamp` (so the schema is exactly what that release created) and writing data with plain SQL in the
 * columns that release knew; the e2e specs then move it to PostgreSQL and check the data survived. Nothing here edits
 * a released migration.
 */
export interface OlderState {
  readonly name: string;
  /** Class timestamp of the last migration this release had applied. */
  readonly timestamp: number;
  seed(source: DataSource): Promise<void>;
  /**
   * Installs the plugins this release had (their storage migrated, data written) into the SQLite file and returns the
   * descriptors the host passes to the transfer. Runs after `seed`, on the same connection.
   */
  installPlugins?(file: string, source: DataSource): Promise<PluginDescriptor[]>;
}

export const rows = <T = Record<string, unknown>>(
  source: DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => source.query(sql, params);
