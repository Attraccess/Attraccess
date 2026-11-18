import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';

/** The plugin of the transfer suite: SDK 2.0 storage with every value kind whose engine form differs from its meaning. */
export const TRANSFER_PLUGIN = { id: '@demo/air-quality', version: '2.1.0' } as const;

const measurementV1 = table({
  id: f.id(),
  sensor: f.string({ length: 40 }),
  reading: f.decimal(12, 3),
  takenAt: f.timestamp(),
  calibrated: f.boolean().withDefault(false),
  day: f.date().optional(),
  meta: f.json().optional(),
});
const measurement = table({ ...measurementV1.fields, unit: f.string({ length: 20 }).optional() });

export const TRANSFER_PLUGIN_STORAGE = definePluginStorage({
  tables: { measurement },
  migrations: [
    { version: 1, name: 'measurements', steps: [step.createTable('measurement', measurementV1)] },
    { version: 2, name: 'unit', steps: [step.addColumn('measurement', 'unit', f.string({ length: 20 }).optional())] },
  ],
});

/** The physical table the host derives for the plugin's `measurement` table. */
export const TRANSFER_PLUGIN_TABLE = 'plugin_demo_air_quality_measurement';

/** Rows written through the record port by `installPlugin(…, true)`, and what the snapshot must carry for them. */
export const TRANSFER_PLUGIN_ROWS = [
  {
    write: {
      sensor: 'pm25',
      reading: '12.34',
      takenAt: new Date('2026-06-01T10:00:00.500Z'),
      calibrated: true,
      day: '2026-06-01',
      meta: { source: 'lab' },
      unit: 'ug/m3',
    },
    exported: { reading: '12.340', takenAt: '2026-06-01T10:00:00.500Z', calibrated: true, day: '2026-06-01' },
  },
  {
    write: { sensor: 'co2', reading: '-0.005', takenAt: new Date('2026-06-01T10:00:00.000Z') },
    exported: { reading: '-0.005', takenAt: '2026-06-01T10:00:00.000Z', calibrated: false, day: null, unit: null },
  },
] as const;
