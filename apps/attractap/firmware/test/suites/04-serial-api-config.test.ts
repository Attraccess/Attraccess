/**
 * Suite 4 — Serial: API Configuration
 *
 * - api.configuration.set with mock server host/port/SSL=false
 * - api.status.get transitions through connecting_websocket → connected → authenticated
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import {
  openSerial,
  closeSerial,
  sendSerialCommand,
  waitForSerialMessage,
} from '../helpers/serial.js';
import {
  createMockServer,
  MOCK_SERVER_PORT,
  RUNNER_HOST,
  TEST_PIN,
} from './setup.js';

const BOOT_TIMEOUT_MS = 60_000;
const STATUS_TRANSITION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

let server: MockWsServer;

function authPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { authCode: TEST_PIN, ...extra };
}

beforeAll(async () => {
  server = createMockServer();
  await server.start();
  await openSerial();
  await waitForSerialMessage(/\S/, BOOT_TIMEOUT_MS);
});

afterAll(async () => {
  await closeSerial();
  await server.stop();
});

describe('Serial — API Configuration', () => {
  it('api.configuration.set returns success', async () => {
    const resp = await sendSerialCommand<{ success?: boolean; error?: string }>(
      'api.configuration.set',
      authPayload({ hostname: RUNNER_HOST, port: MOCK_SERVER_PORT, useSSL: false })
    );
    expect(resp.error).toBeUndefined();
    expect(resp.success).toBe(true);
  });

  it('api.status.get transitions to connecting_websocket immediately', async () => {
    const resp = await sendSerialCommand<{ status: string }>(
      'api.status.get',
      authPayload()
    );
    // May already be past connecting by the time we poll
    expect(['connecting_websocket', 'connected', 'authenticated']).toContain(resp.status);
  });

  it('api.status.get eventually reaches authenticated', async () => {
    // Respond to READER_REGISTER so the device can authenticate
    server.waitForMessage('READER_REGISTER', STATUS_TRANSITION_TIMEOUT_MS).then(() => {
      server.send('READER_REGISTER', { payload: { id: 1, token: 'test-token-abc' } });
    });

    const deadline = Date.now() + STATUS_TRANSITION_TIMEOUT_MS;
    let status = 'unknown';

    while (Date.now() < deadline) {
      const resp = await sendSerialCommand<{ status: string }>(
        'api.status.get',
        authPayload()
      );
      status = resp.status;
      if (status === 'authenticated') break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    expect(status).toBe('authenticated');
  });
});
