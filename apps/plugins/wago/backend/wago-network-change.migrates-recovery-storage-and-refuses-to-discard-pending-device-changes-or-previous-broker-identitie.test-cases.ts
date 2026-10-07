import { DataSource } from 'typeorm';
import { WagoNetworkChanges1780010660000 } from './migrations/1780010660000-add-wago-network-changes';
import type { RootTestRegistrationsTestScope } from "./wago-network-change.spec";
export function registerMigratesRecoveryStorageAndRefusesToDiscardPendingDeviceChangesOrPreviousBrokerIdentitie(scope: RootTestRegistrationsTestScope): void {
it('migrates recovery storage and refuses to discard pending device changes or previous broker identities', async () => {
  const db = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  const runner = db.createQueryRunner(),
    migration = new WagoNetworkChanges1780010660000();
  try {
    await runner.query('CREATE TABLE plugin_wago_controllers (id integer PRIMARY KEY)');
    await runner.query('INSERT INTO plugin_wago_controllers VALUES (1)');
    await migration.up(runner);
    await runner.query(
      `INSERT INTO plugin_wago_network_changes
      (controller_id, session_id, fingerprint, target_host, mqtt_server_id, phase, encrypted_payload, updated_at)
      VALUES (1, 1, ?, ?, 2, 'applying', 'encrypted-intent', ?)`,
      [scope.fingerprint, scope.newHost, new Date().toISOString()],
    );
    await expect(migration.down(runner)).rejects.toThrow('Finish controller network changes');
    await runner.query("UPDATE plugin_wago_network_changes SET phase = 'completed'");
    await runner.query('INSERT INTO plugin_wago_mqtt_credential_retirements VALUES (1, 1)');
    await expect(migration.down(runner)).rejects.toThrow('Retire old broker credentials');
    await runner.query('DELETE FROM plugin_wago_controllers WHERE id = 1');
    expect(await runner.query('SELECT * FROM plugin_wago_network_changes')).toEqual([]);
    expect(await runner.query('SELECT * FROM plugin_wago_mqtt_credential_retirements')).toEqual([]);
    await migration.down(runner);
  } finally {
    await runner.release();
    await db.destroy();
  }
});
}
