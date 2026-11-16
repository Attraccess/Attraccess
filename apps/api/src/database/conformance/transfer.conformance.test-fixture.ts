import {
  SnapshotIncompatibleError,
  parseSnapshot,
  serializeSnapshot,
  type DatabaseSnapshot,
  type PluginDescriptor,
  type SnapshotValue,
  type TableSnapshot,
} from '../transfer-snapshot';
import type { TransferBackendFixture, TransferDatabase } from './transfer-fixture';

/**
 * The data every backend fixture writes in `populate()`. Ids are chosen with gaps on purpose (a deleted user, a
 * deleted highest transaction), amounts and readings exceed what a double can hold, and instants come in the
 * different forms an engine may store them.
 */
export const TRANSFER_DATASET = {
  userIds: [1, 3],
  /** 2^53 + 1: the first integer a JavaScript number cannot represent. */
  hugeAmount: '9007199254740993',
  meterLifetime: '123456789012345678901234567890.123456789',
  meterCounter: '0.1',
  /** Instants that mean `2026-03-29T03:15:00.000Z`, stored as the engine may store them. */
  usageEnd: '2026-03-29T03:15:00.000Z',
  usageStart: '2026-03-29T01:30:00.000Z',
  millisecondInstant: '2026-06-01T12:00:00.123Z',
  adminDescription: 'Custom description (é, ü, 日本)',
  /** The highest transaction id ever issued, deleted again: the next generated id must be above it. */
  highestIssuedTransactionId: 99,
} as const;

export const TRANSFER_PLUGIN = { id: '@demo/air-quality', version: '1.2.3' } as const;

const table = (snapshot: DatabaseSnapshot, name: string): TableSnapshot => {
  const found = snapshot.tables.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`snapshot has no table ${name}`);
  return found;
};

/** Rows of a table as objects, for readable assertions. */
const records = (snapshot: DatabaseSnapshot, name: string): Record<string, SnapshotValue>[] => {
  const { columns, rows } = table(snapshot, name);
  return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column.name, row[index]])));
};

/**
 * The export, import and backup contract (docs/en/developer/adding-a-database-backend.md). Everything is asserted on
 * neutral snapshots, so the suite runs unchanged on every backend that supplies a fixture.
 */
export function describeTransferConformance(fixture: TransferBackendFixture): void {
  describe(`export, import and backup contract on ${fixture.name}`, () => {
    let source: TransferDatabase;
    let target: TransferDatabase;
    let plugin: PluginDescriptor;
    let snapshot: DatabaseSnapshot;
    const open: TransferDatabase[] = [];

    const create = async (): Promise<TransferDatabase> => {
      const database = await fixture.create();
      open.push(database);
      return database;
    };

    beforeEach(async () => {
      source = await create();
      target = await create();
      plugin = await source.installPlugin(TRANSFER_PLUGIN, true);
      await target.installPlugin(TRANSFER_PLUGIN, false);
      await source.populate();
      snapshot = await source.exportSnapshot({ plugins: [plugin] });
    });

    afterEach(async () => {
      await Promise.all(open.splice(0).map((database) => database.close()));
    });

    afterAll(async () => {
      await fixture.dispose?.();
    });

    const restoredSnapshot = () => target.exportSnapshot({ plugins: [plugin] });

    it('restores everything: exporting the restored database equals the source export', async () => {
      await target.importSnapshot(snapshot);
      expect(await restoredSnapshot()).toEqual(snapshot);
      expect(await target.integrityViolations()).toEqual([]);
    });

    it('restores from the serialized form, so a snapshot can be stored and moved as a file', async () => {
      await target.importSnapshot(parseSnapshot(serializeSnapshot(snapshot)));
      expect(await restoredSnapshot()).toEqual(snapshot);
    });

    it('replaces data that already exists in the target instead of merging with it', async () => {
      await target.populate();
      await target.addTopUp(1, 5);
      await target.importSnapshot(snapshot);
      expect(await restoredSnapshot()).toEqual(snapshot);
    });

    describe('stable ids and relationships', () => {
      it('keeps every primary key, including gaps, and every reference between rows', async () => {
        await target.importSnapshot(snapshot);
        const restored = await restoredSnapshot();
        expect(records(restored, 'user').map((user) => user.id)).toEqual(TRANSFER_DATASET.userIds);
        const [usage] = records(restored, 'resource_usage');
        expect(usage).toMatchObject({ id: 1, resourceId: 1, userId: 3 });
        expect(records(restored, 'billing_transaction').find((tx) => tx.resourceUsageId === 1)).toMatchObject({
          userId: 3,
        });
        expect(await target.integrityViolations()).toEqual([]);
      });

      it('continues generated ids after the highest id the source ever issued', async () => {
        const sourceNext = await source.addTopUp(1, 1);
        await target.importSnapshot(snapshot);
        const targetNext = await target.addTopUp(1, 1);
        expect(sourceNext.id).toBe(TRANSFER_DATASET.highestIssuedTransactionId + 1);
        expect(targetNext.id).toBe(sourceNext.id);
      });
    });

    describe('timestamps and time zones', () => {
      it('exports instants in UTC with millisecond precision whatever form the engine stored them in', () => {
        const [usage] = records(snapshot, 'resource_usage');
        expect(usage.startTime).toBe(TRANSFER_DATASET.usageStart);
        expect(usage.endTime).toBe(TRANSFER_DATASET.usageEnd);
        const [meter] = records(snapshot, 'resource_meter');
        expect(meter.latestObservedAt).toBe(TRANSFER_DATASET.millisecondInstant);
        for (const { name, columns, rows } of snapshot.tables) {
          columns.forEach((column, index) => {
            if (column.kind !== 'timestamp') return;
            for (const row of rows) {
              const value = row[index];
              if (value !== null)
                expect([name, column.name, value]).toEqual([
                  name,
                  column.name,
                  expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
                ]);
            }
          });
        }
      });

      it('restores the same instants', async () => {
        await target.importSnapshot(snapshot);
        const restored = await restoredSnapshot();
        const [usage] = records(restored, 'resource_usage');
        expect(Date.parse(String(usage.endTime)) - Date.parse(String(usage.startTime))).toBe(105 * 60_000);
        expect(records(restored, 'resource_meter')[0].latestObservedAt).toBe(TRANSFER_DATASET.millisecondInstant);
      });
    });

    describe('exact monetary and meter values', () => {
      it('exports integers beyond double precision and decimal readings without rounding', () => {
        const topUp = records(snapshot, 'billing_transaction').find((tx) => tx.externalReference === 'huge');
        expect(topUp?.amount).toEqual({ integer: TRANSFER_DATASET.hugeAmount });
        expect(records(snapshot, 'user').find((user) => user.id === 1)?.creditBalance).toEqual({
          integer: TRANSFER_DATASET.hugeAmount,
        });
        const [meter] = records(snapshot, 'resource_meter');
        expect(meter.lifetimeValue).toBe(TRANSFER_DATASET.meterLifetime);
        expect(meter.counterValue).toBe(TRANSFER_DATASET.meterCounter);
      });

      it('copies price snapshots and accepted observations unchanged', async () => {
        await target.importSnapshot(snapshot);
        const restored = await restoredSnapshot();
        const [usage] = records(restored, 'resource_usage');
        expect(usage).toMatchObject({
          sessionDurationCreditsPerMinute: 3,
          operatingDurationCreditsPerMinute: 7,
          attributedOperatingDurationInMinutes: 12.5,
        });
        expect(records(restored, 'resource_metering_session')[0]).toMatchObject({
          baselineValue: '1000.000000001',
          latestValue: '1012.345678902',
          consumedValue: '12.345678901',
        });
        expect(records(restored, 'user').find((user) => user.id === 1)?.creditBalance).toEqual({
          integer: TRANSFER_DATASET.hugeAmount,
        });
      });

      it('keeps text exactly, including non-ASCII characters', async () => {
        await target.importSnapshot(snapshot);
        const role = records(await restoredSnapshot(), 'role').find((candidate) => candidate.key === 'administrator');
        expect(role?.description).toBe(TRANSFER_DATASET.adminDescription);
      });
    });

    describe('plugin data and plugin migration state', () => {
      it('exports the plugin tables with their rows, the plugin migration state and the plugin version', () => {
        expect(snapshot.plugins).toHaveLength(1);
        const exported = snapshot.plugins[0];
        expect(exported).toMatchObject({ id: TRANSFER_PLUGIN.id, version: TRANSFER_PLUGIN.version });
        expect(exported.tables).toEqual(plugin.tables);
        expect(exported.migrations.length).toBeGreaterThan(0);
        for (const name of plugin.tables) expect(table(snapshot, name).rows.length).toBeGreaterThan(0);
      });

      it('restores plugin rows and the plugin migration state into the plugin schema', async () => {
        await target.importSnapshot(snapshot);
        const restored = await restoredSnapshot();
        expect(restored.plugins).toEqual(snapshot.plugins);
        for (const name of plugin.tables) expect(table(restored, name)).toEqual(table(snapshot, name));
      });

      it('refuses a target whose plugin is at another migration state, and changes nothing', async () => {
        const before = await restoredSnapshot();
        const advanced = {
          ...snapshot,
          plugins: snapshot.plugins.map((candidate) => ({
            ...candidate,
            migrations: candidate.migrations.slice(0, -1),
          })),
        };
        await expect(target.importSnapshot(advanced)).rejects.toThrow(SnapshotIncompatibleError);
        expect(await restoredSnapshot()).toEqual(before);
      });

      it('refuses a target that does not have the plugin installed, and changes nothing', async () => {
        const bare = await create();
        const before = await bare.exportSnapshot();
        await expect(bare.importSnapshot(snapshot)).rejects.toThrow(SnapshotIncompatibleError);
        expect(await bare.exportSnapshot()).toEqual(before);
      });
    });

    describe('core migration state', () => {
      it('exports the migration state of the core track and restores it', async () => {
        expect(snapshot.core.migrations.length).toBeGreaterThan(100);
        expect(new Set(snapshot.core.migrations.map((migration) => migration.name)).size).toBe(
          snapshot.core.migrations.length,
        );
        await target.importSnapshot(snapshot);
        expect((await restoredSnapshot()).core).toEqual(snapshot.core);
      });

      it('refuses a database at another core migration state, and changes nothing', async () => {
        const before = await restoredSnapshot();
        const newer = { ...snapshot, core: { ...snapshot.core, migrations: snapshot.core.migrations.slice(0, -1) } };
        await expect(target.importSnapshot(newer)).rejects.toThrow(/core migration state/);
        expect(await restoredSnapshot()).toEqual(before);
      });

      it('refuses a snapshot written by another migration track', async () => {
        const foreign = { ...snapshot, core: { ...snapshot.core, track: 'another-engine' } };
        await expect(target.importSnapshot(foreign)).rejects.toThrow(/migration track/);
      });
    });

    describe('derived data', () => {
      it('does not apply balances a second time while rows are copied', async () => {
        await target.importSnapshot(snapshot);
        expect(await target.integrityViolations()).toEqual([]);
        expect(records(await restoredSnapshot(), 'user').find((user) => user.id === 1)?.creditBalance).toEqual({
          integer: TRANSFER_DATASET.hugeAmount,
        });
      });

      it('keeps the balance maintenance active after the restore', async () => {
        await target.importSnapshot(snapshot);
        const afterSource = await source.addTopUp(3, 250);
        const afterTarget = await target.addTopUp(3, 250);
        expect(afterTarget.balance).toBe(afterSource.balance);
        expect(await target.integrityViolations()).toEqual([]);
      });
    });

    describe('atomic restore', () => {
      it('changes nothing when the snapshot breaks a reference', async () => {
        await target.populate();
        const before = await restoredSnapshot();
        const broken: DatabaseSnapshot = {
          ...snapshot,
          tables: snapshot.tables.map((candidate) =>
            candidate.name !== 'resource_usage'
              ? candidate
              : {
                  ...candidate,
                  rows: candidate.rows.map((row) =>
                    row.map((value, index) => (candidate.columns[index].name === 'userId' ? 4242 : value)),
                  ),
                },
          ),
        };
        await expect(target.importSnapshot(broken)).rejects.toThrow(/foreign key/i);
        expect(await restoredSnapshot()).toEqual(before);
        expect(await target.integrityViolations()).toEqual([]);
      });

      it('refuses a snapshot whose table does not match the schema of the database', async () => {
        const before = await restoredSnapshot();
        const renamed: DatabaseSnapshot = {
          ...snapshot,
          tables: snapshot.tables.map((candidate) =>
            candidate.name === 'role'
              ? { ...candidate, columns: candidate.columns.map((column) => ({ ...column, name: `${column.name}_x` })) }
              : candidate,
          ),
        };
        await expect(target.importSnapshot(renamed)).rejects.toThrow(SnapshotIncompatibleError);
        expect(await restoredSnapshot()).toEqual(before);
      });
    });
  });
}
