import type { DataSource } from 'typeorm';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { postgresBackend } from '../postgres/postgres-backend';
import { createSqlitePluginMigrationEngine } from '../sqlite/sqlite-plugin-migrations';
import type { PluginDescriptor } from '../transfer-snapshot';
import { TRANSFER_PLUGIN_STORAGE } from './transfer-plugin.test-fixture';

/**
 * The data set of the transfer conformance suite (TRANSFER_DATASET), written the way SQLite databases of released
 * versions hold it: naive and offset text instants, 0/1 booleans, AUTOINCREMENT ids with a deleted highest one.
 * `source` is a SQLite connection migrated to the end of the frozen track.
 */
export async function populateSqliteDataset(source: DataSource): Promise<void> {
  await source.query(
    `INSERT INTO "user" (id, username, email) VALUES (1, 'zoe', 'zoe@example.com'), (3, 'yan', 'yan@example.com')`,
  );
  await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')");
  await source.query(
    `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, usageAction, isFinalized,
      attributedOperatingDurationInMinutes, sessionDurationCreditsPerMinute, operatingDurationCreditsPerMinute)
      VALUES (1, 1, 3, '2026-03-29 01:30:00', '2026-03-29T05:15:00+02:00', 'usage', 1, 12.5, 3, 7)`,
  );
  await source.query(
    `INSERT INTO billing_transaction (id, userId, amount, status, resourceUsageId, externalReference) VALUES
      (1, 1, 9007199254740993, 'completed', NULL, 'huge'),
      (2, 1, 500, 'pending', NULL, 'not-yet'),
      (3, 3, 1000, 'completed', NULL, 'topup'),
      (4, 3, -105, 'completed', 1, NULL)`,
  );
  await source.query("INSERT INTO billing_transaction (id, userId, amount, status) VALUES (99, 3, 1, 'pending')");
  await source.query('DELETE FROM billing_transaction WHERE id = 99');
  await source.query(
    `INSERT INTO resource_meter (id, resourceId, name, creditsPerUnit, lifetimeValue, counterValue, latestObservedAt)
      VALUES (1, 1, 'Energy (kWh)', 15, '123456789012345678901234567890.123456789', '0.1', '2026-06-01 12:00:00.123')`,
  );
  await source.query(
    `INSERT INTO resource_metering_session (id, resourceId, usageId, status, creditsPerUnit, baselineValue, source,
      latestValue, latestObservedAt, consumedValue, chargeCredits, meterId, collectionMode, meterName)
      VALUES ('session-1', 1, 1, 'settled', 15, '1000.000000001', 'grid', '1012.345678902', '2026-06-01 12:00:00',
      '12.345678901', 186, 1, 'requested', 'Energy (kWh)')`,
  );
  await source.query(
    `INSERT INTO audit_log (id, at, domain, action, operationId, actorId, outcome, subjectType, subjectId, details)
      VALUES (1, '2026-03-29 03:16:00', 'resource', 'resource.usage.end', 'op-1', 3, 'success', 'resource', 1, '{"usageId":1}')`,
  );
  await source.query("UPDATE role SET description = ? WHERE key = 'administrator'", [
    'Custom description (é, ü, 日本)',
  ]);
}

/**
 * Installs the plugin of the transfer suite in a SQLite file the way the 2.x host did: its storage migrated, rows
 * written in SQLite's forms (scaled integer decimal, UTC text instants, 0/1 booleans, JSON text).
 */
export async function installSqliteTransferPlugin(
  file: string,
  source: DataSource,
  plugin: { id: string; version: string },
): Promise<PluginDescriptor> {
  const storage = compilePluginStorage(plugin.id, TRANSFER_PLUGIN_STORAGE, {
    reservedTables: postgresBackend.plugins.coreTableNames(),
  });
  await createSqlitePluginMigrationEngine(file).migrate(storage);
  await source.query(
    `INSERT INTO "plugin_demo_air_quality_measurement" (sensor, reading, takenAt, calibrated, day, meta, unit) VALUES
      ('pm25', 12340, '2026-06-01 10:00:00.500', 1, '2026-06-01', '{"source":"lab"}', 'ug/m3'),
      ('co2', -5, '2026-06-01 10:00:00.000', 0, NULL, NULL, NULL)`,
  );
  return { ...plugin, storage };
}
