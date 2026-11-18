import { resolve } from 'node:path';
import type { PluginStorageDefinition } from '@attraccess/plugins-backend-sdk';
import { compilePluginStorage } from '../../../plugin-system/plugin-storage/storage-schema';
import type { StorageBackendFixture } from './storage-fixture';

/** The plugin the contract suite's storage is installed for. */
const CONTRACT_PLUGIN = 'storage-contract';

interface ContractSide {
  persistence: unknown;
  items: unknown;
  notes: unknown;
  pairs: unknown;
}
type ContractFactory = (
  definition: PluginStorageDefinition,
) => Promise<{ open(): Promise<ContractSide>; close(): Promise<void> }>;

// The suite lives with the SDK, so the in-memory fake runs the very same cases. It is loaded by path because the
// SDK's public entry deliberately does not export test code.
const sdkLib = resolve(__dirname, '../../../../../../libs/plugins-backend-sdk/src/lib');
const { definePluginStorageContractSuite } = require(resolve(sdkLib, 'plugin-storage-contract.test-cases')) as {
  definePluginStorageContractSuite(name: string, create: ContractFactory): void;
};

/**
 * Runs the SDK's backend-neutral storage contract on a database backend: the contract's storage is migrated by the
 * backend's migration engine, and every `open()` is a new independent connection with the plugin's contexts on it.
 */
export function describePluginStorageContract(fixture: StorageBackendFixture): void {
  definePluginStorageContractSuite(fixture.name, async (definition) => {
    const db = await fixture.create();
    const compiled = compilePluginStorage(CONTRACT_PLUGIN, definition, { reservedTables: db.coreTables() });
    await db.engine.migrate(compiled);
    return {
      async open() {
        const connection = await db.connect();
        const contexts = connection.contexts(CONTRACT_PLUGIN, compiled);
        const tables = contexts.storage.open(definition) as unknown as Omit<ContractSide, 'persistence'>;
        return { persistence: contexts.persistence, ...tables };
      },
      close: () => db.close(),
    };
  });
}
