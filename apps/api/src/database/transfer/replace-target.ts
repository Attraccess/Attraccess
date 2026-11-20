import type { DataSource } from 'typeorm';
import { replacedTables } from '../postgres/postgres-transfer';
import { SqliteTransferError } from './transfer-errors';
import type { TransferLog } from './sqlite-to-postgres';

/** The `application_name` of the API's connections (postgres-connection.ts). */
export const API_APPLICATION_NAME = 'attraccess';
/** The `application_name` of the transfer's own connection, so it never counts as a running API. */
export const TRANSFER_APPLICATION_NAME = 'attraccess-transfer';

type Query = Pick<DataSource, 'query'>;

/**
 * `transfer-sqlite --force` empties every table of the target. A running API would keep writing into the data being
 * replaced. This sees only the API connections open right now: the pool closes idle ones, so a quiet API may have none
 * and pass. It catches a busy API; stopping every instance stays the operator's job.
 */
export async function assertNoRunningApi(source: Query): Promise<void> {
  const [{ sessions }]: { sessions: number }[] = await source.query(
    `SELECT COUNT(*)::int AS sessions FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = $1 AND pid <> pg_backend_pid()`,
    [API_APPLICATION_NAME],
  );
  if (sessions > 0) {
    throw new SqliteTransferError(
      'checking the target',
      `${sessions} connection(s) of a running Attraccess API use the PostgreSQL database right now; stop every ` +
        'API instance before replacing its data with --force',
      { outcome: 'refused' },
    );
  }
}

/** The check above passed: says what it could not see. */
export const IDLE_API_WARNING =
  '--force: no API connection is open right now. An idle API may hold none, so this cannot prove that the API is ' +
  'stopped: stop every API instance before you replace the data.';

/** Names, before anything is deleted, every table whose content `--force` replaces. */
export async function logReplacedTables(source: Query, logger: Pick<TransferLog, 'warn'>): Promise<void> {
  const tables = await replacedTables(source);
  logger.warn(IDLE_API_WARNING);
  logger.warn(
    `--force: deleting the content of ${tables.length} table(s) of the PostgreSQL database and replacing it with ` +
      `the SQLite data: ${tables.join(', ')}`,
  );
}
