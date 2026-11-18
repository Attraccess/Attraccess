import { AttractapCrashReport } from '@attraccess/database-entities';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { ResetReportCountReader } from '../../../metrics/metrics-readers.port';
import { TypeOrmResetReportCountReader } from './typeorm-metrics-readers';

/** A statement runner for tests that prepare data by SQL: one query and one transaction of queries. */
export interface FixtureQueries {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  transaction(work: (queries: Pick<FixtureQueries, 'query'>) => Promise<void>): Promise<void>;
}

export interface PostgresFixtureDatabase extends FixtureQueries {
  /** The reset-report reader the metrics collector uses, bound to this database. */
  readonly resetReportReader: ResetReportCountReader;
  close(): Promise<void>;
}

/**
 * Opens a connection to an existing test database (its URL from `createTestDatabaseLocation`) for tests that
 * exercise the real count queries beside a running API, e.g. the alerting stack. The schema is whatever the test
 * created by SQL.
 */
export async function openPostgresFixtureDatabase(location: string): Promise<PostgresFixtureDatabase> {
  const source = await createTestDataSource({ location, entities: [AttractapCrashReport] });
  return {
    query: (sql, parameters) => source.query(sql, parameters),
    transaction: (work) =>
      source.transaction(async (manager) => work({ query: (sql, parameters) => manager.query(sql, parameters) })),
    resetReportReader: new TypeOrmResetReportCountReader(source.getRepository(AttractapCrashReport)),
    close: () => closeTestDataSource(source),
  };
}
