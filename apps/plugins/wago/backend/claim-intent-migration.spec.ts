import { DataSource } from 'typeorm';
import * as migrations from './migrations';

it('preserves interrupted credential revocation metadata through a full-registry blocked downgrade', async () => {
  const database = await new DataSource({
    type: 'sqlite',
    database: ':memory:',
    migrations: Object.values(migrations),
  }).initialize();
  try {
    await database.runMigrations();
    await database.query(`INSERT INTO plugin_wago_controllers
      (hardware_id, trust_state, pairing_code_hash, protocol_version, runtime_version, capabilities, last_seen_at, created_at, updated_at, credential_mqtt_server_id)
      VALUES ('fixture', 'untrusted', 'fixture', '1', '1', '[]', 'fixture', 'fixture', 'fixture', 19)`);
    await expect(database.undoLastMigration()).rejects.toThrow('Revoke tracked WAGO credentials');
    expect(await database.query('SELECT hardware_id, credential_mqtt_server_id FROM plugin_wago_controllers')).toEqual([
      { hardware_id: 'fixture', credential_mqtt_server_id: 19 },
    ]);
    expect(await database.showMigrations()).toBe(false);
    await database.query('DELETE FROM plugin_wago_controllers');
    for (let i = 0; i < Object.keys(migrations).length; i++) await database.undoLastMigration();
    expect(await database.showMigrations()).toBe(true);
    await database.runMigrations();
    expect(await database.query('SELECT * FROM plugin_wago_controllers')).toEqual([]);
  } finally {
    await database.destroy();
  }
});
