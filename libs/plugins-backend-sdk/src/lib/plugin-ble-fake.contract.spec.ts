import { createFakeBleHost } from './plugin-ble-fake';
import { defineBleContractSessionSuite } from './plugin-ble-contract-sessions.test-cases';
import { defineBleContractWatchSuite } from './plugin-ble-contract-watch.test-cases';
import { defineBleContractSuite, type BleContractFactory } from './plugin-ble-contract.test-cases';

const fake: BleContractFactory = async (options) => ({
  host: createFakeBleHost(options),
  dispose: async () => undefined,
});

defineBleContractSuite('SDK fake transport', fake);
defineBleContractSessionSuite('SDK fake transport', fake);
defineBleContractWatchSuite('SDK fake transport', fake);
