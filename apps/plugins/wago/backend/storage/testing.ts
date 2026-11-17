import {
  createInMemoryPluginStorage,
  type InMemoryPluginStorage,
  type InMemoryPluginStorageOptions,
} from '@attraccess/plugins-backend-sdk';
import { openWagoStorage, wagoStorage } from './index';
import type { WagoStorage } from './rows';

export interface WagoTestStorage extends InMemoryPluginStorage {
  /** The typed record port over the in-memory tables; what `openWagoStorage(context)` returns in production. */
  readonly tables: WagoStorage;
}

/**
 * In-memory WAGO storage for unit tests. Spread `storage` and `persistence` into the plugin context a test hands to the
 * code under test: `{ storage: test.storage, persistence: test.persistence, ... }`. Calls made inside
 * `persistence.transaction` must pass the scope, exactly as against the host.
 */
export function createWagoTestStorage(options?: InMemoryPluginStorageOptions): WagoTestStorage {
  const memory = createInMemoryPluginStorage(wagoStorage, options);
  return Object.assign(memory, { tables: openWagoStorage(memory) });
}
