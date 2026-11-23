import { definePluginStorage, step } from '@attraccess/plugins-backend-sdk';
import { WAGO_LEGACY_MIGRATIONS } from './legacy-migrations';
import type { WagoStorage, WagoStorageHost } from './rows';
import { wagoTables } from './tables';

/**
 * The WAGO plugin's storage: baseline version 1 is the table layout the nineteen 1.x TypeORM migrations produced, so
 * installed databases are adopted in place (see `adoption.legacyMigrations`). New schema changes become version 2+.
 */
export const wagoStorage = definePluginStorage({
  tables: wagoTables,
  migrations: [
    {
      version: 1,
      name: 'baseline',
      steps: Object.entries(wagoTables).map(([name, definition]) => step.createTable(name, definition)),
    },
  ],
  adoption: { legacyMigrations: WAGO_LEGACY_MIGRATIONS, namespace: 'wago' },
});

/** Opens the record port of every WAGO table. Cheap: call it once per service. */
export function openWagoStorage(context: WagoStorageHost): WagoStorage {
  return context.storage.open(wagoStorage) as unknown as WagoStorage;
}

export { WAGO_LEGACY_MIGRATIONS } from './legacy-migrations';
export { wagoTables } from './tables';
export * from './rows';
export type { TypedInsert, TypedRow, TypedTableApi } from './typed';
