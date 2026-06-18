/**
 * Suite 5 — WebSocket: Reader Registration & Authentication
 *
 * - Device sends READER_REGISTER
 * - Server responds with READER_REGISTER containing id + token
 * - Device responds with READER_AUTHENTICATE
 * - Server responds with READER_AUTHENTICATED
 * - Device is now authenticated (api.status.get returns "authenticated")
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
  bootstrapSuite,
  createMockServer,
  TEST_PIN,
} from './setup.js';

let server: MockWsServer;

function authPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { authCode: TEST_PIN, ...extra };
}

beforeAll(async () => {
  server = createMockServer();
  await openSerial();
  await waitForSerialMessage(/\S/, 60_000);
  await server.start();
});

afterAll(async () => {
  await closeSerial();
  await server.stop();
});

describe('WebSocket — Reader Registration & Authentication', () => {
  it('device sends READER_REGISTER on connect', async () => {
    // bootstrapSuite waits for connection + READER_REGISTER internally via configureDeviceViaSerial
    // But for this suite we drive the flow step by step.
    await bootstrapSuite(server);
    // The bootstrap helper already waits for connection.
    // READER_REGISTER may have already been consumed by bootstrapSuite; check queue.
    // We re-drain and let the device retry if needed.
    server.drainQueue();

    // Send a READER_UNAUTHORIZED to force re-registration
    server.send('READER_UNAUTHORIZED', {
      payload: { message: 'force re-register for test' },
    });

    const _registerPayload = await server.waitForMessage('READER_REGISTER', 30_000);
    expect(_registerPayload).toBeDefined();
  });

  it('server responds with READER_REGISTER containing id and token', async () => {
    server.send('READER_REGISTER', { payload: { id: 42, token: 'e2e-test-token' } });
    // Device will now send READER_AUTHENTICATE
    const authPayloadWs = await server.waitForMessage('READER_AUTHENTICATE', 30_000);
    expect(authPayloadWs).toBeDefined();
    expect((authPayloadWs as Record<string, unknown>)?.id).toBe(42);
    expect((authPayloadWs as Record<string, unknown>)?.token).toBe('e2e-test-token');
  });

  it('server sends READER_AUTHENTICATED and device reaches authenticated state', async () => {
    server.send('READER_AUTHENTICATED', { payload: { name: 'Test Reader', success: true } });

    const deadline = Date.now() + 15_000;
    let status = 'unknown';
    while (Date.now() < deadline) {
      const resp = await sendSerialCommand<{ status: string }>('api.status.get', authPayload());
      status = resp.status;
      if (status === 'authenticated') break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(status).toBe('authenticated');
  });
});
