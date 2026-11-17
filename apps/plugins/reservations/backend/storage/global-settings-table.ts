import { f, table } from '@attraccess/plugins-backend-sdk';

/** Plugin-wide key/value settings (currently only `timezone`). */
export const globalSettingsTable = table(
  { key: f.string(), value: f.text() },
  { primaryKey: ['key'], physicalName: 'reservations_global_settings' },
);
