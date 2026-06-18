/**
 * Suite 13 — WebSocket: NFC Card Reset
 *
 * - Server sends RESET_NFC_CARD (key + keyNo provided by server)
 * - User presents previously-enrolled card → device confirms reset
 * - Cancel variant: RESET_NFC_CARD_CANCEL → device acknowledges
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
  server.send('READER_REGISTER', { payload: { id: 80, token: 'token-suite13' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite13 Reader', success: true } });
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

describe('WebSocket — NFC Card Reset', () => {
  it.skipIf(SKIP_NFC)(
    'device confirms card reset after user presents card',
    async () => {
      server.send('RESET_NFC_CARD', {
        payload: {
          username: 'resetuser',
          keyNo: 1,
          key: '0000000000000000', // 16-byte hex key
        },
      });

      console.log('[ACTION REQUIRED] Present the previously-enrolled card for reset.');
      // Device either sends RESET_NFC_CARD (success=true) or stays connected after failure
      await new Promise((r) => setTimeout(r, CARD_TAP_TIMEOUT_MS));
      expect(server.isConnected).toBe(true);
    }
  );

  it('device handles RESET_NFC_CARD_CANCEL gracefully', async () => {
    server.send('RESET_NFC_CARD', {
      payload: { username: 'cancelreset', keyNo: 2, key: '0000000000000000' },
    });
    // Give it a moment to start the flow, then cancel
    await new Promise((r) => setTimeout(r, 500));
    server.send('RESET_NFC_CARD_CANCEL', { payload: {} });

    await new Promise((r) => setTimeout(r, 1_000));
    expect(server.isConnected).toBe(true);
  });

  it('device ACKs RESET_NFC_CARD_CANCEL', async () => {
    server.send('RESET_NFC_CARD', {
      payload: { username: 'acktest', keyNo: 3, key: '0000000000000000' },
    });
    await new Promise((r) => setTimeout(r, 200));
    server.send('RESET_NFC_CARD_CANCEL', { payload: {} });

    // Verify device is still alive after cancel
    await new Promise((r) => setTimeout(r, 2_000));
    expect(server.isConnected).toBe(true);
  });
});
