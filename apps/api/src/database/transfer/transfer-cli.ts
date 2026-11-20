import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import { resolveDatabasePath } from '../../config/storage-path';
import { resolvePluginDir } from '../../config/app.config';
import { PluginService } from '../../plugin-system/plugin.service';
import { resolveDatabaseBackend } from '../backend/resolve-database-backend';
import { parsePostgresConfig, redactDatabaseUrl } from '../postgres/postgres-config';
import { waitForPostgres } from '../postgres/postgres-connection';
import { runTransfer } from './startup-transfer';
import { SqliteTransferError } from './transfer-errors';

export const TRANSFER_COMMAND = 'transfer-sqlite';

const USAGE = `Usage: ${TRANSFER_COMMAND} [--sqlite <path>] [--force] [--keep]

Moves the data of a SQLite installation into the PostgreSQL database of DATABASE_URL.
  --sqlite <path>  The SQLite file (default: <STORAGE_ROOT>/attraccess.sqlite).
  --force          Replace data that is already in the PostgreSQL database: every table except the migration history
                   is emptied (it lists them first). Stop every API instance first. It refuses while an API
                   connection is open, but an idle API may have none open right now: it cannot prove that every API
                   instance is stopped. Without it a non-empty target is refused.
  --keep           Do not rename the SQLite file after a successful transfer.
The SQLite file is never modified except for the final rename.`;

/** The manual transfer command (tests, re-runs, non-default paths). Returns the process exit code. */
export async function runTransferCommand(argv: readonly string[]): Promise<number> {
  const logger = new Logger('SqliteTransfer');
  let args;
  try {
    args = parseArgs({
      args: [...argv],
      options: {
        sqlite: { type: 'string' },
        force: { type: 'boolean' },
        keep: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      strict: true,
    }).values;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  try {
    resolveDatabaseBackend();
    const config = parsePostgresConfig();
    logger.log(`Target: PostgreSQL ${redactDatabaseUrl(config.url)} (schema ${config.schema})`);
    await waitForPostgres(config);
    PluginService.configure({ PLUGIN_DIR: resolvePluginDir(), RESTART_BY_EXIT: false });
    const transferred = await runTransfer({
      sqliteFile: args.sqlite ?? resolveDatabasePath(),
      whenTargetHasData: args.force ? 'replace' : 'refuse',
      keepFile: args.keep,
    });
    if (!transferred) logger.warn('Nothing was transferred: the SQLite file does not exist (anymore).');
    return transferred ? 0 : 1;
  } catch (error) {
    logger.error(
      error instanceof SqliteTransferError ? error.describe('command') : `Transfer failed: ${(error as Error).message}`,
    );
    return 1;
  }
}
