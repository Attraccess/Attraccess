import { DataSource } from 'typeorm';
import { WagoCommissioningLease1780000000011 } from '../wago-commissioning-lease.migration';
import { DropWagoCommissioningLease1780010640000 } from './1780010640000-drop-wago-commissioning-lease';

it('drops persisted interrupted coordinator state on upgrade', async () => {
  const db = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  const runner = db.createQueryRunner();
  try {
    await new WagoCommissioningLease1780000000011().up(runner);
    await runner.query(
      `INSERT INTO plugin_wago_commissioning_lease
      (fingerprint_hash, owner, lease_until, operation_until, recovery_after)
      VALUES (?, ?, ?, ?, ?)`,
      ['a'.repeat(64), 'old-worker', 1, 2, 3],
    );
    await new DropWagoCommissioningLease1780010640000().up(runner);
    expect(await runner.hasTable('plugin_wago_commissioning_lease')).toBe(false);
  } finally {
    await runner.release();
    await db.destroy();
  }
});
