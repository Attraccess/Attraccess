import type { PluginMigrationEngine, PluginStorageMigrationPlan } from '../persistence/plugin-migration-engine.port';
import { PLUGIN_MIGRATION_GUIDE_URL } from '../runtime/plugin-compatibility';
import type { PluginStorageDdl, PluginStorageMigrationDriver } from './storage-dialect.port';
import {
  type CompiledPluginStorage,
  PluginStorageMigrationFailed,
  PluginStorageMigrationRefused,
} from './storage-model';

/** The 1.x release whose plugin data 2.0 adopts: every bundled plugin's legacy history is complete there. */
const LAST_1X_RELEASE = '1.11';
const LISTED_MISSING = 5;

/** Why a partial 1.x history is refused, and the only way forward: through the last 1.x release. */
function partialHistoryReason(pluginName: string, missing: readonly string[]): string {
  const listed =
    missing.length > LISTED_MISSING
      ? `${missing.slice(0, LISTED_MISSING).join(', ')} and ${missing.length - LISTED_MISSING} more`
      : missing.join(', ');
  return (
    `the 1.x migrations ${listed} are not applied (partial history). Attraccess 2.0 adopts the data of plugin ` +
    `"${pluginName}" only from the last 1.x release (${LAST_1X_RELEASE}). Restore the backup taken before this ` +
    `upgrade, update to Attraccess ${LAST_1X_RELEASE} and start it once so the plugin's migrations finish, then ` +
    `update to 2.0. Migration guide: ${PLUGIN_MIGRATION_GUIDE_URL}`
  );
}

/** The tables the committed versions (up to `version`) created, parents before children. */
function tablesCreatedUpTo(storage: CompiledPluginStorage, version: number): string[] {
  const tables: string[] = [];
  for (const migration of storage.migrations.filter((candidate) => candidate.version <= version)) {
    for (const step of migration.steps) {
      if (step.op === 'createTable' && !tables.includes(step.table.physical)) tables.push(step.table.physical);
    }
  }
  return tables;
}

/**
 * Decides what to do with a plugin's tables from what the database holds: the versions of the neutral bookkeeping
 * and the names in the legacy TypeORM migrations table. Pure; it never reads or writes.
 *
 * - Bookkeeping present: continue after the recorded versions (refuse a database newer than this release).
 * - No bookkeeping, every legacy migration applied: adopt the tables as baseline version 1, run the rest.
 * - No bookkeeping, only some legacy migrations applied (or ones this release does not know): refuse.
 * - Neither: a fresh install, run everything.
 */
export function planStorageMigration(
  storage: CompiledPluginStorage,
  applied: readonly number[],
  legacy: readonly string[] | null,
): PluginStorageMigrationPlan {
  const refuse = (reason: string) => new PluginStorageMigrationRefused(storage.pluginName, reason);
  const versions = storage.migrations.map((migration) => migration.version);
  const latest = versions.at(-1) ?? 0;

  if (applied.length > 0) {
    if (applied.some((version, index) => version !== index + 1)) {
      throw refuse(`its recorded migration versions (${applied.join(', ')}) are not a continuous history.`);
    }
    if (applied.length > latest) {
      throw refuse(
        `the database is at version ${applied.length} but this release only knows up to version ${latest}. ` +
          'Install the release that ships the newer version, or restore a backup.',
      );
    }
    return { pending: versions.filter((version) => version > applied.length), adopt: false };
  }

  const names = legacy ?? [];
  if (names.length === 0) return { pending: versions, adopt: false };
  if (storage.legacyMigrations.length === 0) {
    throw refuse(
      `the database holds data of a 1.x release (${names.length} legacy migrations) but this release declares no ` +
        'adoption of it. Contact the plugin author.',
    );
  }
  const known = new Set(storage.legacyMigrations);
  const unknown = names.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw refuse(
      `the 1.x migrations ${unknown.join(', ')} are applied but this release does not know them. Update the plugin.`,
    );
  }
  const missing = storage.legacyMigrations.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw refuse(partialHistoryReason(storage.pluginName, missing));
  }
  return { pending: versions.filter((version) => version > 1), adopt: true };
}

/**
 * Backend-neutral migration engine: validation, planning, adoption and the order of work are here; the driver brings
 * the transaction and the bookkeeping of one engine, the DDL port turns steps into that engine's statements.
 */
export class StorageMigrationRunner implements PluginMigrationEngine {
  constructor(
    private readonly driver: PluginStorageMigrationDriver,
    private readonly ddl: PluginStorageDdl,
  ) {}

  assess(storage: CompiledPluginStorage): Promise<PluginStorageMigrationPlan> {
    return this.driver.read(storage, async (session) =>
      planStorageMigration(storage, await session.appliedVersions(), await session.legacyMigrationNames()),
    );
  }

  migrate(storage: CompiledPluginStorage): Promise<PluginStorageMigrationPlan> {
    return this.driver.transaction(storage, async (session) => {
      const plan = planStorageMigration(storage, await session.appliedVersions(), await session.legacyMigrationNames());
      if (plan.adopt) {
        await session.recordVersion({ version: 1, name: storage.migrations[0].name, source: 'adopted' });
      }
      for (const migration of storage.migrations.filter(({ version }) => plan.pending.includes(version))) {
        try {
          for (const step of migration.steps) {
            await session.checkStep(step);
            await session.execute(this.ddl.statements(step));
          }
          if (migration.data) await migration.data({ tables: session.recordPort(migration.schemaAfter) });
          await session.recordVersion({ version: migration.version, name: migration.name, source: 'migrated' });
        } catch (error) {
          throw new PluginStorageMigrationFailed(storage.pluginName, migration.version, (error as Error).message);
        }
      }
      return plan;
    });
  }

  /**
   * Drops what the plugin owns: the tables of its committed versions (an adopted baseline counts as version 1) and
   * its bookkeeping. A plugin whose first version never committed (it failed, or was refused because a declared
   * table already existed) owns none of the declared tables, so none is dropped and its 1.x history stays with them.
   */
  dropAll(storage: CompiledPluginStorage): Promise<void> {
    return this.driver.transaction(storage, async (session) => {
      const applied = await session.appliedVersions();
      const committed = applied.length === 0 ? 0 : Math.max(...applied);
      await session.dropAll(tablesCreatedUpTo(storage, committed), { keepLegacyHistory: committed === 0 });
    });
  }
}
