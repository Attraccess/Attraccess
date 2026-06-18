/**
 * Suite 12 — WebSocket: NFC Card Enrollment
 *
 * - Server sends ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO
 * - Device sends ENROLL_NEW_CARD_REQUEST_NFC_KEY (prompting the user)
 * - User presents card → device sends ENROLL_NEW_CARD
 * - Cancel variant: server sends ENROLL_NEW_CARD_CANCEL, device acknowledges
 *
 * NFC card tap is manual; set ATTRACTAP_SKIP_NFC_TESTS=true to skip.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

const SKIP_NFC = process.env.ATTRACTAP_SKIP_NFC_TESTS === 'true';
const CARD_TAP_TIMEOUT_MS = 90_000;
const FLOW_TIMEOUT_MS = 15_000;

let server: MockWsServer;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 15_000);
  server.send('READER_REGISTER', { payload: { id: 70, token: 'token-suite12' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite12 Reader', success: true } });
}

beforeAll(async () => {
  server = createMockServer();
  await openSerial();
  await waitForSerialMessage(/\S/, 60_000);
  await bootstrapSuite(server);
  await authenticate();
});

afterAll(async () => {
  await closeSerial();
  await server.stop();
});

describe('WebSocket — NFC Card Enrollment', () => {
  it('device sends ENROLL_NEW_CARD_REQUEST_NFC_KEY after server initiates enrollment', async () => {
    server.send('ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', {
      payload: { username: 'newuser', availableKeyNo: 2 },
    });

    const msg = await server.waitForMessage(
      'ENROLL_NEW_CARD_REQUEST_NFC_KEY',
      FLOW_TIMEOUT_MS
    );
    expect(msg).toBeDefined();
  });

  it.skipIf(SKIP_NFC)(
    'device sends ENROLL_NEW_CARD after user card tap',
    async () => {
      console.log('[ACTION REQUIRED] Present a new NFC card for enrollment.');
      const enrollPayload = await server.waitForMessage(
        'ENROLL_NEW_CARD',
        CARD_TAP_TIMEOUT_MS
      ) as Record<string, unknown>;
      expect(enrollPayload).toBeDefined();

      // Server confirms enrollment
      server.send('ENROLL_NEW_CARD', { payload: { success: true } });
      await new Promise((r) => setTimeout(r, 500));
      expect(server.isConnected).toBe(true);
    }
  );

  it('device handles ENROLL_NEW_CARD_CANCEL gracefully', async () => {
    // Start a new enrollment flow, then cancel
    server.send('ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', {
      payload: { username: 'canceluser', availableKeyNo: 3 },
    });
    await server.waitForMessage('ENROLL_NEW_CARD_REQUEST_NFC_KEY', FLOW_TIMEOUT_MS);

    server.send('ENROLL_NEW_CARD_CANCEL', { payload: {} });
    await new Promise((r) => setTimeout(r, 1_000));
    expect(server.isConnected).toBe(true);
  });
});
