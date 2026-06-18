/**
 * Suite 8 — WebSocket: Two-Card Supervision Flow
 *
 * - Server sends SUPERVISION_REQUEST
 * - First card → device sends REQUEST_CARD_AUTHENTICATION_DATA → CARD_AUTHENTICATION_DATA
 * - Second (supervisor) card → REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA → SUPERVISOR_CARD_AUTHENTICATION_DATA
 * - Server resolves with SUPERVISION_RESOLVED
 *
 * NFC card taps are manual; set ATTRACTAP_SKIP_NFC_TESTS=true to skip.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

const SKIP_NFC = process.env.ATTRACTAP_SKIP_NFC_TESTS === 'true';
const CARD_TAP_TIMEOUT_MS = 90_000;

let server: MockWsServer;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 10_000);
  server.send('READER_REGISTER', { payload: { id: 30, token: 'token-suite8' } });
  await server.waitForMessage('READER_AUTHENTICATE', 10_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite8 Reader', success: true } });
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

describe('WebSocket — Two-Card Supervision Flow', () => {
  it.skipIf(SKIP_NFC)(
    'device requests CARD_AUTHENTICATION_DATA after SUPERVISION_REQUEST',
    async () => {
      server.send('SUPERVISION_REQUEST', {
        payload: {
          success: true,
          timeoutMs: 60_000,
          supervisorCount: 1,
          supervisorNames: ['Supervisor A'],
        },
      });

      console.log('[ACTION REQUIRED] Present the first (user) card to the reader.');
      const payload = await server.waitForMessage(
        'CARD_AUTHENTICATION_DATA',
        CARD_TAP_TIMEOUT_MS
      );
      expect(payload).toBeDefined();
    }
  );

  it.skipIf(SKIP_NFC)(
    'device requests SUPERVISOR_CARD_AUTHENTICATION_DATA for second card',
    async () => {
      // Respond to first card auth
      server.send('CARD_AUTHENTICATION_DATA', {
        payload: {
          keyNo: 0,
          keyBytes: Array(16).fill(1),
          username: 'user-a',
          requiresSupervisor: true,
        },
      });

      console.log('[ACTION REQUIRED] Present the supervisor card to the reader.');
      const payload = await server.waitForMessage(
        'SUPERVISOR_CARD_AUTHENTICATION_DATA',
        CARD_TAP_TIMEOUT_MS
      );
      expect(payload).toBeDefined();
    }
  );

  it.skipIf(SKIP_NFC)(
    'server sends SUPERVISION_RESOLVED and device accepts',
    async () => {
      server.send('SUPERVISOR_CARD_AUTHENTICATION_DATA', {
        payload: {
          keyNo: 1,
          keyBytes: Array(16).fill(2),
          username: 'supervisor-b',
        },
      });

      server.send('SUPERVISION_RESOLVED', {
        payload: { success: true, supervisorUsername: 'supervisor-b' },
      });

      await new Promise((r) => setTimeout(r, 1_000));
      expect(server.isConnected).toBe(true);
    }
  );
});
