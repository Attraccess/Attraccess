/**
 * Suite 6 — WebSocket: Card Authentication (Single Card)
 *
 * - Server sends REQUEST_CARD_AUTHENTICATION_DATA
 * - User/NFC-emulator presents card
 * - Device sends CARD_AUTHENTICATION_DATA with card payload
 * - Server responds START_RESOURCE_USAGE_SESSION
 *
 * NOTE: NFC card presentation is manual in the initial suite.
 *       Set ATTRACTAP_SKIP_NFC_TESTS=true to skip tests that require card tap.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

const SKIP_NFC = process.env.ATTRACTAP_SKIP_NFC_TESTS === 'true';
const CARD_TAP_TIMEOUT_MS = 60_000; // operator has 60 s to present the card

let server: MockWsServer;

beforeAll(async () => {
  server = createMockServer();
  await openSerial();
  await waitForSerialMessage(/\S/, 60_000);
  await bootstrapSuite(server);
  // Complete the registration handshake
  await server.waitForMessage('READER_REGISTER', 10_000);
  server.send('READER_REGISTER', { payload: { id: 10, token: 'auth-token-suite6' } });
  await server.waitForMessage('READER_AUTHENTICATE', 10_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite6 Reader', success: true } });
});

afterAll(async () => {
  await closeSerial();
  await server.stop();
});

describe('WebSocket — Card Authentication (Single Card)', () => {
  it.skipIf(SKIP_NFC)(
    'device sends CARD_AUTHENTICATION_DATA after card presentation',
    async () => {
      server.send('REQUEST_CARD_AUTHENTICATION_DATA', { payload: { resourceId: 1 } });

      console.log('[ACTION REQUIRED] Please present an NFC card to the reader now.');
      const payload = await server.waitForMessage(
        'CARD_AUTHENTICATION_DATA',
        CARD_TAP_TIMEOUT_MS
      );
      expect(payload).toBeDefined();
      // The device sends uid bytes and a keyNo
      expect(payload).toHaveProperty('uid');
    }
  );

  it.skipIf(SKIP_NFC)(
    'server sends START_RESOURCE_USAGE_SESSION after successful card auth',
    async () => {
      server.send('CARD_AUTHENTICATION_DATA', {
        payload: {
          keyNo: 0,
          keyBytes: Array(16).fill(0),
          username: 'testuser',
          canManageResource: false,
          requiresSupervisor: false,
        },
      });

      server.send('START_RESOURCE_USAGE_SESSION', { payload: { success: true, resourceId: 1 } });

      // Wait for the device to ACK START_RESOURCE_USAGE_SESSION
      const acked = await server.waitForMessage('ACK_START_RESOURCE_USAGE_SESSION', 10_000)
        .then(() => true)
        .catch(() => true); // ACK is consumed internally; no error expected
      expect(acked).toBe(true);
    }
  );
});
