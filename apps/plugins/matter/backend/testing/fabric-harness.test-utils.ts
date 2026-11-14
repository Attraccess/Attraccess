// Test harness for fabric persistence and backups: the device harness (real SQLite with the plugin's migrations) plus
// the fabric, backup and restore services on top of an in-process fake sidecar.
import { MatterBackupService } from '../backup/backup.service';
import { MatterRestoreService, type RollbackTiming } from '../backup/restore.service';
import { MatterBackupSchedulerService, type SchedulerTiming } from '../backup/scheduler.service';
import { MatterFabricService } from '../fabric/fabric.service';
import { MatterFabricGuard } from '../fabric/guard';
import { RecoveryKeyService } from '../fabric/recovery-key.service';
import type { PluginMigrationReader } from '../fabric/tokens';
import type { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { createHarness, ADMIN } from './devices-harness.test-utils';
import { FakeFabricBackend, FakeFabricConnection } from './fake-fabric.test-utils';

export { ADMIN };

/** Rollback retries short enough for a test, still several attempts before the outcome counts as unknown. */
export const TEST_ROLLBACK_TIMING: RollbackTiming = { windowMs: 300, firstRetryMs: 5, maxRetryMs: 40 };

export async function createFabricHarness(
  options: { timing?: Partial<SchedulerTiming>; validationTtlMs?: number; rollbackTiming?: RollbackTiming } = {},
) {
  const h = await createHarness();
  const backend = new FakeFabricBackend();
  const connection = new FakeFabricConnection(backend);
  const connectionService = { connection } as unknown as MatterConnectionService;
  const guard = new MatterFabricGuard();
  const audit = new DeviceAuditService(h.context);
  const keys = new RecoveryKeyService(h.context, audit);
  /** The last applied plugin migration, from the table the test database records them in. */
  const migrationReader: PluginMigrationReader = async () =>
    ((await h.dataSource.query('SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1')) as { name: string }[])[0]
      ?.name ?? null;
  const reconciliation = new MatterReconciliationService(h.context, connectionService, audit, guard);
  const backups = new MatterBackupService(h.context, connectionService, keys, audit, guard, migrationReader);
  const fabric = new MatterFabricService(h.context, connectionService, guard, keys, backups, audit, reconciliation);
  const restore = new MatterRestoreService(
    h.context,
    connectionService,
    keys,
    backups,
    fabric,
    guard,
    audit,
    reconciliation,
    migrationReader,
    options.validationTtlMs,
    options.rollbackTiming ?? TEST_ROLLBACK_TIMING,
  );
  const scheduler = new MatterBackupSchedulerService(
    h.context,
    connectionService,
    fabric,
    backups,
    guard,
    options.timing,
  );
  return {
    ...h,
    backend,
    connection,
    guard,
    /** The reconciliation the fabric services use (against the fake fabric sidecar), not the device harness's. */
    reconciliation,
    keys,
    backups,
    fabric,
    restore,
    scheduler,
    migrationReader,
    /** Everything the plugin wrote to logs and audit, as one string: for "no secret anywhere" assertions. */
    emitted: () => {
      const logger = h.context.logger as unknown as Record<string, jest.Mock>;
      return JSON.stringify([
        h.audit.mock.calls,
        ...['debug', 'warn', 'error', 'log'].map((name) => logger[name].mock.calls),
      ]);
    },
  };
}
export type FabricHarness = Awaited<ReturnType<typeof createFabricHarness>>;
