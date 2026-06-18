/**
 * Suite 15 — WebSocket: Billing Top-Up Request
 *
 * - Server sends BILLING_REQUEST_TOPUP
 * - Device responds with expected acknowledgement (stays connected, no crash)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

let server: MockWsServer;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 15_000);
  server.send('READER_REGISTER', { payload: { id: 100, token: 'token-suite15' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite15 Reader', success: true } });
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

describe('WebSocket — Billing Top-Up Request', () => {
  it('device stays connected after receiving BILLING_REQUEST_TOPUP', async () => {
    server.send('BILLING_REQUEST_TOPUP', {
      payload: { amountCents: 500, currency: 'EUR' },
    });

    await new Promise((r) => setTimeout(r, 2_000));
    expect(server.isConnected).toBe(true);
  });

  it('device does not crash on BILLING_REQUEST_TOPUP with zero amount', async () => {
    server.send('BILLING_REQUEST_TOPUP', { payload: { amountCents: 0, currency: 'EUR' } });
    await new Promise((r) => setTimeout(r, 1_000));
    expect(server.isConnected).toBe(true);
  });
});
