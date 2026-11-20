import { postgresConnectionOptions } from '../postgres/postgres-connection';
import type { PostgresConfig } from '../postgres/postgres-config';
import {
  API_APPLICATION_NAME,
  assertNoRunningApi,
  IDLE_API_WARNING,
  logReplacedTables,
  TRANSFER_APPLICATION_NAME,
} from './replace-target';
import { SqliteTransferError } from './transfer-errors';

describe('replacing the target with transfer-sqlite --force', () => {
  it('looks for the application_name the API connects with, which the transfer itself does not use', () => {
    const options = postgresConnectionOptions({
      url: 'postgres://u:p@localhost:5432/attraccess',
      schema: 'public',
      ssl: 'off',
      poolMax: 1,
    } as PostgresConfig) as { extra: { application_name: string } };
    expect(options.extra.application_name).toBe(API_APPLICATION_NAME);
    expect(TRANSFER_APPLICATION_NAME).not.toBe(API_APPLICATION_NAME);
  });

  it('refuses while connections of a running API use the database, changing nothing', async () => {
    const query = jest.fn().mockResolvedValue([{ sessions: 2 }]);
    const error = await assertNoRunningApi({ query } as never).catch((e) => e);
    expect(error).toBeInstanceOf(SqliteTransferError);
    expect(error.outcome).toBe('refused');
    expect(error.message).toContain(
      '2 connection(s) of a running Attraccess API use the PostgreSQL database right now; stop every API instance ' +
        'before replacing its data with --force. Nothing was changed',
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_backend_pid()'), [API_APPLICATION_NAME]);
  });

  it('lets the replacement go ahead without API connections', async () => {
    await expect(assertNoRunningApi({ query: jest.fn().mockResolvedValue([{ sessions: 0 }]) } as never)).resolves.toBe(
      undefined,
    );
  });

  it('names every table it empties, leaving out the migration bookkeeping', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { table_name: 'audit_log' },
        { table_name: 'migrations' },
        { table_name: 'plugin_ledger_entry' },
        { table_name: 'typeorm_metadata' },
        { table_name: 'user' },
      ]);
    const warn = jest.fn();
    await logReplacedTables({ query } as never, { warn });
    expect(warn).toHaveBeenCalledWith(
      '--force: deleting the content of 3 table(s) of the PostgreSQL database and replacing it with the SQLite ' +
        'data: audit_log, plugin_ledger_entry, user',
    );
    // The connection check cannot see an idle API: the operator is told so before anything is deleted.
    expect(warn).toHaveBeenNthCalledWith(1, IDLE_API_WARNING);
    expect(IDLE_API_WARNING).toContain('no API connection is open right now');
  });
});
