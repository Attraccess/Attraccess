import { SHELLY_LEGACY_MIGRATIONS, shellyStorage } from './storage';
import { compareBaselineWithLegacy } from '../../testing/legacy-layout.test-utils';

// The DDL `CreateShellyDevices1749470400000` ran in 1.x, copied verbatim. Installed databases keep this table.
const LEGACY_DDL = [
  `CREATE TABLE IF NOT EXISTS "plugin_shelly_devices" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar NOT NULL,
        "ip_address" varchar NOT NULL,
        "generation" integer,
        "model" varchar,
        "auth_state" varchar NOT NULL DEFAULT ('unknown'),
        "last_probe_at" varchar,
        "last_probe_error" varchar,
        "created_at" varchar NOT NULL,
        "updated_at" varchar NOT NULL,
        CONSTRAINT "UQ_plugin_shelly_devices_ip_address" UNIQUE ("ip_address")
      )`,
];

describe('shelly storage baseline', () => {
  it('declares exactly the table layout the 1.x migration produced', () => {
    const { legacy, declared } = compareBaselineWithLegacy(shellyStorage, LEGACY_DDL);
    expect(declared).toEqual(legacy);
  });

  it('adopts databases that ran the only legacy migration', () => {
    expect(shellyStorage.adoption?.legacyMigrations).toEqual(['CreateShellyDevices1749470400000']);
    expect(SHELLY_LEGACY_MIGRATIONS).toHaveLength(1);
  });

  it('starts the neutral migrations with the baseline at version 1', () => {
    expect(shellyStorage.migrations.map((migration) => migration.version)).toEqual([1]);
  });
});
