import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { DataSource } from 'typeorm';
import { postgresBackend } from '../../../database/postgres/postgres-backend';
import {
  createSqliteWorkspace,
  migrateSqliteTo,
  type SqliteWorkspace,
} from '../../../database/transfer/sqlite-import.test-fixture';
import { transferSqliteToPostgres, type TransferSummary } from '../../../database/transfer/sqlite-to-postgres';
import type { DatabaseSnapshot, PluginDescriptor } from '../../../database/transfer-snapshot';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import type { OlderState } from './older-state.test-fixture';

export const quiet = { log: () => undefined, warn: () => undefined };

export interface OldInstallation {
  readonly workspace: SqliteWorkspace;
  /** The plugins the release had installed, as the host describes them to the transfer. */
  readonly plugins: PluginDescriptor[];
}

/**
 * The SQLite file of an older release: migrated only up to the state's timestamp, seeded with the data of that release
 * (and its plugins), then closed like a stopped installation.
 */
export async function createOldInstallation(state: OlderState): Promise<OldInstallation> {
  process.env.AUTH_SESSION_SECRET ||= 'e2e-sqlite-transfer-secret';
  const workspace = await createSqliteWorkspace();
  const source = await migrateSqliteTo(workspace.file, state.timestamp);
  try {
    await state.seed(source);
    const plugins = (await state.installPlugins?.(workspace.file, source)) ?? [];
    return { workspace, plugins };
  } finally {
    await source.destroy();
  }
}

export const sha256 = async (file: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

/** Opens the connection string of a PostgreSQL connection for the plugin migration engine. */
export const urlOf = (source: DataSource): string => (source.options as { url: string }).url;

/** What a transfer reports, and the neutral snapshot of the final SQLite state that it handed to the import. */
export type CapturedTransfer = TransferSummary & { readonly snapshot: DatabaseSnapshot };

export interface PostgresTarget {
  readonly source: DataSource;
  /**
   * Runs the transfer. The migrations of the frozen track stamp the rows they seed with the time they ran, so two
   * exports of one SQLite file differ in those instants: the snapshot to compare with is the one the import received.
   */
  transfer(installation: OldInstallation, options?: { markMigrated?: boolean }): Promise<CapturedTransfer>;
  close(): Promise<void>;
}

/** A new PostgreSQL database at the current release (baseline applied, no user data). */
export async function createPostgresTarget(): Promise<PostgresTarget> {
  const source = await createTestDataSource();
  return {
    source,
    async transfer(installation, options = {}) {
      const capture = jest.spyOn(postgresBackend.transfer, 'importSnapshot');
      try {
        const summary = await transferSqliteToPostgres({
          sqliteFile: installation.workspace.file,
          target: source,
          plugins: installation.plugins,
          targetPluginEngine: postgresBackend.plugins.createMigrationEngine({
            type: 'postgres',
            url: urlOf(source),
          } as never),
          logger: quiet,
          markMigrated: options.markMigrated ?? false,
        });
        return { ...summary, snapshot: capture.mock.calls[0][1] };
      } finally {
        capture.mockRestore();
      }
    },
    close: () => closeTestDataSource(source),
  };
}
