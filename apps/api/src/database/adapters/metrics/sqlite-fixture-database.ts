import { DataSource } from 'typeorm';
import { AttractapCrashReport } from '@attraccess/database-entities';
import { ResetReportCountReader } from '../../../metrics/metrics-readers.port';
import { TypeOrmResetReportCountReader } from './typeorm-metrics-readers';

/** A statement runner for tests that prepare data by SQL: one query and one transaction of queries. */
export interface FixtureQueries {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  transaction(work: (queries: Pick<FixtureQueries, 'query'>) => Promise<void>): Promise<void>;
}

export interface SqliteFixtureDatabase extends FixtureQueries {
  /** The reset-report reader the metrics collector uses, bound to this database. */
  readonly resetReportReader: ResetReportCountReader;
  close(): Promise<void>;
}

/**
 * Opens a SQLite database file for tests that exercise the real count queries beside a running API, e.g. the
 * alerting stack. Several connections to one file wait for each other's locks instead of failing at once.
 */
export async function openSqliteFixtureDatabase(file: string): Promise<SqliteFixtureDatabase> {
  const source = await new DataSource({ type: 'sqlite', database: file, busyTimeout: 5000 }).initialize();
  return {
    query: (sql, parameters) => source.query(sql, parameters),
    transaction: (work) =>
      source.transaction(async (manager) => work({ query: (sql, parameters) => manager.query(sql, parameters) })),
    resetReportReader: new TypeOrmResetReportCountReader(source.getRepository(AttractapCrashReport)),
    close: () => source.destroy(),
  };
}
