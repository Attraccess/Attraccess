import { definePluginStorage, step } from '@attraccess/plugins-backend-sdk';
import { WAGO_LEGACY_MIGRATIONS } from './legacy-migrations';
import type { WagoStorage, WagoStorageHost } from './rows';
import { wagoBaselineTables, wagoControllerSequenceField, wagoLeaseDeadlineField, wagoTables } from './tables';

/**
 * The WAGO plugin's storage: baseline version 1 is the table layout the nineteen 1.x TypeORM migrations produced, so
 * installed databases are adopted in place (see `adoption.legacyMigrations`). Version 2 turns the lease deadlines into
 * timestamps, version 3 widens the controller sequence.
 */
export const wagoStorage = definePluginStorage({
  tables: wagoTables,
  migrations: [
    {
      version: 1,
      name: 'baseline',
      steps: Object.entries(wagoBaselineTables).map(([name, definition]) => step.createTable(name, definition)),
    },
    {
      // The baseline's integer lease deadlines overflow PostgreSQL's 32-bit integer with epoch milliseconds, so no
      // lease could ever be taken. Leases are transient: replacing the columns drops nothing worth keeping.
      version: 2,
      name: 'lease-deadlines-as-timestamps',
      steps: ['deviceOperations', 'management'].flatMap((name) => [
        step.dropColumn(name, 'leaseUntil'),
        step.addColumn(name, 'leaseUntil', wagoLeaseDeadlineField),
      ]),
    },
    {
      // Discovery announces `Date.now()` as its sequence, which the baseline's 32-bit integer cannot store, so no
      // controller could ever be discovered. The sequence only orders legacy heartbeats; restarting it at 0 is safe.
      version: 3,
      name: 'controller-sequence-as-decimal',
      steps: [
        step.dropColumn('controllers', 'lastSequence'),
        step.addColumn('controllers', 'lastSequence', wagoControllerSequenceField),
      ],
    },
  ],
  adoption: { legacyMigrations: WAGO_LEGACY_MIGRATIONS, namespace: 'wago' },
});

/** Opens the record port of every WAGO table. Cheap: call it once per service. */
export function openWagoStorage(context: WagoStorageHost): WagoStorage {
  return context.storage.open(wagoStorage) as unknown as WagoStorage;
}

export { WAGO_LEGACY_MIGRATIONS } from './legacy-migrations';
export { MAX_STORED_SEQUENCE, wagoBaselineTables, wagoTables } from './tables';
export * from './rows';
export type { TypedInsert, TypedRow, TypedTableApi } from './typed';
