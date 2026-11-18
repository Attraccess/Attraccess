// Storage declaration of the Shelly device registry (SDK 2.0 plugin storage).
//
// Version 1 is the baseline: exactly the `plugin_shelly_devices` table the 1.x TypeORM migration
// `CreateShellyDevices1749470400000` produced, so installed databases are adopted in place (nothing runs, the data
// stays). Column names, the textual timestamp shape and the unique IP constraint are kept as they were. Values that
// can exceed 255 characters are `text` fields: the legacy columns are unbounded varchar, stored as TEXT like text.
import { definePluginStorage, f, step, table, type PluginStorageRow } from '@attraccess/plugins-backend-sdk';
import type { AuthState } from '../types';

const devices = table(
  {
    id: f.id(),
    /** Operator-entered, without a length limit (like the device-reported model and the probe error). */
    name: f.text(),
    ipAddress: f.string({ column: 'ip_address' }),
    /** Shelly generation: 1 for Gen1, 2/3/… for Gen2+. Null until first probe. */
    generation: f.integer().optional(),
    /** Device model string (Gen2+ `model`, Gen1 `type`). Null until first probe. */
    model: f.text().optional(),
    authState: f.string({ column: 'auth_state' }).withDefault('unknown'),
    /** ISO timestamp of the last probe attempt, or null if never attempted. */
    lastProbeAt: f.string({ column: 'last_probe_at' }).optional(),
    /** Error message from the last probe attempt, or null if the last probe succeeded. */
    lastProbeError: f.text({ column: 'last_probe_error' }).optional(),
    // Stored as ISO strings: the table predates the record port and keeps its original textual timestamp shape.
    createdAt: f.string({ column: 'created_at' }),
    updatedAt: f.string({ column: 'updated_at' }),
  },
  {
    indexes: [{ name: 'UQ_plugin_shelly_devices_ip_address', fields: ['ipAddress'], unique: true }],
    physicalName: 'plugin_shelly_devices',
  },
);

/** Class names of every TypeORM migration the 1.x plugin shipped (adoption of existing installations). */
export const SHELLY_LEGACY_MIGRATIONS = ['CreateShellyDevices1749470400000'] as const;

export const shellyStorage = definePluginStorage({
  tables: { devices },
  migrations: [{ version: 1, name: 'baseline', steps: [step.createTable('devices', devices)] }],
  adoption: { legacyMigrations: SHELLY_LEGACY_MIGRATIONS },
});

/** The persisted device record (`authState` narrowed to the values the plugin writes). */
export type ShellyDevice = Omit<PluginStorageRow<typeof devices>, 'authState'> & { authState: AuthState };
