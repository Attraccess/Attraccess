/**
 * Shared test setup used by all E2E suites.
 *
 * Each suite file should import startServer/stopServer + the serial helpers.
 * The global beforeAll/afterAll here are intentionally NOT used so individual
 * suites can control their own lifecycle (some need a fresh flash, others reuse
 * the previous boot).
 */

import { MockWsServer } from '../mock-server/index.js';
import { openSerial, configureDeviceViaSerial } from '../helpers/serial.js';

export const TEST_PIN = process.env.ATTRACTAP_TEST_PIN ?? '1234';
export const MOCK_SERVER_PORT = parseInt(process.env.MOCK_WS_PORT ?? '9001', 10);
export const MOCK_SERVER_HOST = process.env.MOCK_WS_HOST ?? '0.0.0.0';

/** Runner host IP reachable by the device over the local network. */
export const RUNNER_HOST = process.env.RUNNER_HOST ?? '192.168.1.100';

export function createMockServer(): MockWsServer {
  return new MockWsServer({ port: MOCK_SERVER_PORT });
}

/**
 * Standard per-suite bootstrap:
 *   1. Start mock WS server
 *   2. Open serial
 *   3. Configure device to point at mock server (sets PIN if fresh)
 *   4. Wait for WS connection
 */
export async function bootstrapSuite(server: MockWsServer): Promise<void> {
  await server.start();
  await openSerial();
  await configureDeviceViaSerial({
    hostname: RUNNER_HOST,
    port: MOCK_SERVER_PORT,
    useSSL: false,
    pin: TEST_PIN,
  });
  await server.waitForConnection(60_000);
}
