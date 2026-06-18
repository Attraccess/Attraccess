/**
 * Suite 1 — Device Bootstrap
 *
 * Verifies that after a clean flash + reboot the device appears on serial and
 * immediately initiates a WebSocket connection + READER_REGISTER.
 *
 * Prerequisites:
 *   - flash has been erased and firmware flashed by the CI step before this suite runs
 *   - ATTRACTAP_SERIAL_PORT env var points to the USB serial device
 *   - RUNNER_HOST + MOCK_WS_PORT describe where the mock server is reachable
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import {
  openSerial,
  closeSerial,
  waitForSerialMessage,
  configureDeviceViaSerial,
} from '../helpers/serial.js';
import {
  createMockServer,
  MOCK_SERVER_PORT,
  RUNNER_HOST,
  TEST_PIN,
} from './setup.js';

const BOOT_TIMEOUT_MS = 60_000;
const REGISTER_TIMEOUT_MS = 30_000;

let server: MockWsServer;

beforeAll(async () => {
  server = createMockServer();
  await server.start();
  await openSerial();
});

afterAll(async () => {
  await closeSerial();
  await server.stop();
});

describe('Device Bootstrap', () => {
  it('device produces serial output within boot timeout', async () => {
    // Any line on serial indicates the device booted and UART is alive
    const line = await waitForSerialMessage(/\S/, BOOT_TIMEOUT_MS);
    expect(line.length).toBeGreaterThan(0);
  });

  it('device connects to mock WS server after API configuration', async () => {
    await configureDeviceViaSerial({
      hostname: RUNNER_HOST,
      port: MOCK_SERVER_PORT,
      useSSL: false,
      pin: TEST_PIN,
    });
    await server.waitForConnection(REGISTER_TIMEOUT_MS);
    expect(server.isConnected).toBe(true);
  });

  it('device sends READER_REGISTER immediately after WS connection', async () => {
    const payload = await server.waitForMessage('READER_REGISTER', REGISTER_TIMEOUT_MS);
    // payload may be empty (fresh device without an existing ID/token)
    expect(payload).toBeDefined();
  });
});
