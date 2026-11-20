// Test fixture, not used at runtime. The host conformance suite replays it to build an installed 1.x database.
// The DDL `CreateShellyDevices1749470400000` ran in 1.x, copied verbatim. Installed databases keep this table.
export const SHELLY_LEGACY_DDL: readonly string[] = [
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
