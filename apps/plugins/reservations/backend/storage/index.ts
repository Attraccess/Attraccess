// Storage declaration of the reservations plugin (SDK 2.0 plugin storage).
//
// Version 1 is the baseline: exactly the five tables the 1.x TypeORM migrations produced (`CreateReservations...`
// plus the scheduler status indexes of `AddReservationStatusIndexes...`), with their names, camelCase columns,
// defaults, indexes and uniques. Installed databases that ran both legacy migrations are adopted in place.
import {
  definePluginStorage,
  step,
  type PluginContext,
  type PluginStorageTablesApi,
} from '@attraccess/plugins-backend-sdk';
import { globalSettingsTable } from './global-settings-table';
import { icalFeedTable } from './ical-feed-table';
import { noticeTable } from './notice-table';
import { reservationTable } from './reservation-table';
import { resourceSettingsTable } from './resource-settings-table';

/** Class names of every TypeORM migration the 1.x plugin shipped (adoption of existing installations). */
export const RESERVATIONS_LEGACY_MIGRATIONS = [
  'CreateReservations1790000000000',
  'AddReservationStatusIndexes1790000000001',
] as const;

const tables = {
  reservations: reservationTable,
  resourceSettings: resourceSettingsTable,
  globalSettings: globalSettingsTable,
  icalFeeds: icalFeedTable,
  notices: noticeTable,
};

export const reservationsStorage = definePluginStorage({
  tables,
  migrations: [
    {
      version: 1,
      name: 'baseline',
      steps: Object.entries(tables).map(([name, definition]) => step.createTable(name, definition)),
    },
  ],
  adoption: { legacyMigrations: RESERVATIONS_LEGACY_MIGRATIONS, namespace: 'reservations' },
});

export type ReservationsTables = PluginStorageTablesApi<typeof reservationsStorage.tables>;

const opened = new WeakMap<PluginContext, ReservationsTables>();

/**
 * The record-port APIs of the plugin's tables, opened on first use (plugin providers are built before the storage is
 * served) and kept per context.
 */
export function tablesOf(context: PluginContext): ReservationsTables {
  let tables = opened.get(context);
  if (!tables) {
    tables = context.storage.open(reservationsStorage);
    opened.set(context, tables);
  }
  return tables;
}
