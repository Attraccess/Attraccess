import { createFakeBleHost, type FakeBleHost } from '@attraccess/plugins-backend-sdk';
import { resolve } from 'path';
import { createHostBleHarness } from './ble-host-harness.test-fixture';

type BleContractFactory = (options?: { ready?: boolean }) => Promise<{ host: FakeBleHost; dispose(): Promise<void> }>;

// The suite lives with the SDK so the fake's own coverage includes it; the host runs the very same cases.
// It is loaded by path because the SDK's public entry deliberately does not export test code.
const { defineBleContractSuite } = require(
  resolve(__dirname, '../../../../../../libs/plugins-backend-sdk/src/lib/plugin-ble-contract.test-cases'),
) as { defineBleContractSuite(name: string, create: BleContractFactory): void };

defineBleContractSuite('SDK fake transport', async (options) => ({
  host: createFakeBleHost(options),
  dispose: async () => undefined,
}));

defineBleContractSuite('host service with a test driver', async (options) => {
  const harness = await createHostBleHarness(options);
  return { host: harness, dispose: () => harness.dispose() };
});
