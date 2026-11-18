import { createInMemoryPluginStorage } from './plugin-storage-memory';
import { definePluginStorageContractSuite } from './plugin-storage-contract.test-cases';

// The same cases run against the host's database adapters in api:test-conformance.
definePluginStorageContractSuite('in-memory fake', async (definition) => {
  const fake = createInMemoryPluginStorage(definition);
  const tables = fake.storage.open(definition) as never as Record<'items' | 'notes' | 'pairs', unknown>;
  const side = { persistence: fake.persistence, ...tables };
  return { open: async () => side, close: async () => undefined };
});
