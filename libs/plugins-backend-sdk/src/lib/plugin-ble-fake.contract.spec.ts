import { createFakeBleHost } from './plugin-ble-fake';
import { defineBleContractSuite } from './plugin-ble-contract.test-cases';

defineBleContractSuite('SDK fake transport', async (options) => ({
  host: createFakeBleHost(options),
  dispose: async () => undefined,
}));
