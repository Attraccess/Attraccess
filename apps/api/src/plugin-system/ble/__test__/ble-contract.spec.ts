import { createFakeBleHost, type FakeBleHost } from '@attraccess/plugins-backend-sdk';
import { resolve } from 'path';
import { createHostBleHarness } from './ble-host-harness.test-fixture';

type BleContractFactory = (options?: { ready?: boolean }) => Promise<{ host: FakeBleHost; dispose(): Promise<void> }>;

// The suite lives with the SDK so the fake's own coverage includes it; the host runs the very same cases.
// It is loaded by path because the SDK's public entry deliberately does not export test code.
const sdkLib = resolve(__dirname, '../../../../../../libs/plugins-backend-sdk/src/lib');
const { defineBleContractSuite } = require(resolve(sdkLib, 'plugin-ble-contract.test-cases')) as {
  defineBleContractSuite(name: string, create: BleContractFactory): void;
};
const { defineBleContractSessionSuite } = require(resolve(sdkLib, 'plugin-ble-contract-sessions.test-cases')) as {
  defineBleContractSessionSuite(name: string, create: BleContractFactory): void;
};

const fake: BleContractFactory = async (options) => ({
  host: createFakeBleHost(options),
  dispose: async () => undefined,
});
const hostService: BleContractFactory = async (options) => {
  const harness = await createHostBleHarness(options);
  return { host: harness, dispose: () => harness.dispose() };
};

const readerWebsocket: BleContractFactory = async (options) => {
  const harness = await createHostBleHarness({ ...options, transport: 'reader-websocket' });
  return { host: harness, dispose: () => harness.dispose() };
};

for (const define of [defineBleContractSuite, defineBleContractSessionSuite]) {
  define('SDK fake transport', fake);
  define('host service with a test driver', hostService);
  // The real reader driver, protocol v1 over a fake reader socket: what plugins get on real readers.
  define('host service with the reader websocket driver', readerWebsocket);
}
