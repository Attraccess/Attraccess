import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import type {
  PluginStorageDdl,
  PluginStorageMigrationDriver,
  PluginStorageMigrationSession,
} from './storage-dialect.port';
import { planStorageMigration, StorageMigrationRunner } from './storage-migration-runner';
import type { ResolvedStep } from './storage-model';
import { compilePluginStorage } from './storage-schema';

const items = table({ id: f.id(), name: f.string() });
const notes = table(
  { id: f.id(), itemId: f.integer() },
  { foreignKeys: [{ fields: ['itemId'], references: 'items', referencedFields: ['id'] }] },
);
const storage = compilePluginStorage(
  'demo',
  definePluginStorage({
    tables: { items, notes, extra: table({ id: f.id() }) },
    migrations: [
      { version: 1, name: 'baseline', steps: [step.createTable('items', items), step.createTable('notes', notes)] },
      { version: 2, name: 'extra', steps: [step.createTable('extra', table({ id: f.id() }))] },
    ],
    adoption: { legacyMigrations: ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'] },
  }),
  { reservedTables: new Set() },
);

/** A migration session that records what the runner asks of it. */
function fakeSession(applied: number[]) {
  const calls: string[] = [];
  const session: PluginStorageMigrationSession = {
    appliedVersions: async () => applied,
    recordVersion: async ({ version }) => void calls.push(`record ${version}`),
    legacyMigrationNames: async () => null,
    execute: async (statements) => void calls.push(...statements),
    checkStep: async (step) => void calls.push(`check ${step.op}`),
    recordPort: () => ({}),
    dropAll: async (tables, { keepLegacyHistory }) =>
      void calls.push(`drop ${tables.join(',') || '-'} keepLegacy=${keepLegacyHistory}`),
  };
  const driver: PluginStorageMigrationDriver = { transaction: (_storage, work) => work(session) };
  const ddl: PluginStorageDdl = { statements: (step: ResolvedStep) => [`ddl ${step.op}`] };
  return { runner: new StorageMigrationRunner(driver, ddl), calls };
}

describe('StorageMigrationRunner', () => {
  it('checks every step before its statements run', async () => {
    const { runner, calls } = fakeSession([]);
    await runner.migrate(storage);
    expect(calls).toEqual([
      'check createTable',
      'ddl createTable',
      'check createTable',
      'ddl createTable',
      'record 1',
      'check createTable',
      'ddl createTable',
      'record 2',
    ]);
  });

  it.each([
    ['every version committed', [1, 2], 'drop plugin_demo_items,plugin_demo_notes,plugin_demo_extra keepLegacy=false'],
    ['only the baseline committed', [1], 'drop plugin_demo_items,plugin_demo_notes keepLegacy=false'],
    ['nothing committed', [], 'drop - keepLegacy=true'],
  ])('drops on uninstall only the tables of committed versions: %s', async (_label, applied, expected) => {
    const { runner, calls } = fakeSession(applied);
    await runner.dropAll(storage);
    expect(calls).toEqual([expected]);
  });
});

describe('planStorageMigration', () => {
  it('refuses a partial 1.x history, pointing at the last 1.x release and the guide', () => {
    expect(() => planStorageMigration(storage, [], ['A1'])).toThrow(
      'Plugin "demo" storage was not migrated: the 1.x migrations B2, C3, D4, E5, F6 and 1 more are not applied ' +
        '(partial history). Attraccess 2.0 adopts the data of plugin "demo" only from the last 1.x release (1.11). ' +
        'Restore the backup taken before this upgrade, update to Attraccess 1.11 and start it once so the ' +
        "plugin's migrations finish, then update to 2.0. Migration guide: " +
        'https://docs.attraccess.org/#/en/plugins/migrating-to-2',
    );
    expect(() => planStorageMigration(storage, [], ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'])).toThrow(
      /the 1\.x migrations G7 are not applied \(partial history\)/,
    );
  });
});
