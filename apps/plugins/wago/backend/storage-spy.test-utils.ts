import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoStorage } from './storage';
import type { WagoTestStorage } from './storage/testing';

type Spied = { [T in keyof WagoStorage]: { [M in keyof WagoStorage[T]]: jest.Mock } };

/**
 * Wraps every table method of the in-memory WAGO storage in a `jest.fn` that still runs the real call, so a spec can
 * assert how the code under test used the record port. Spread `context` into the plugin context double.
 */
export function spyOnWagoStorage(test: WagoTestStorage) {
  const spied = Object.fromEntries(
    Object.entries(test.tables).map(([name, table]) => [
      name,
      Object.fromEntries(
        Object.entries(table as object).map(([method, call]) => [method, jest.fn(call as (...args: never[]) => unknown)]),
      ),
    ]),
  ) as unknown as Spied;
  const context = {
    storage: { open: () => spied },
    persistence: test.persistence,
  } as unknown as Pick<PluginContext, 'storage' | 'persistence'>;
  /** How often the table was written (insert, update, upsert or delete). */
  const writes = (table: keyof Spied) =>
    (['insert', 'insertMany', 'update', 'upsert', 'delete'] as const).reduce(
      (total, method) => total + (spied[table][method as never] as jest.Mock).mock.calls.length,
      0,
    );
  return { context, spied, writes };
}
