/**
 * Suite 10 — WebSocket: Crash Report
 *
 * - Trigger crash via serial: CMND debug.crash {}
 * - On reboot, device sends READER_CRASH_REPORT containing resetReason,
 *   coredumpBase64, and other diagnostics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import {
  openSerial,
  closeSerial,
  waitForSerialMessage,
  writeSerialRaw,
} from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

const REBOOT_TIMEOUT_MS = 45_000;
const CRASH_REPORT_TIMEOUT_MS = 60_000;

let server: MockWsServer;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 15_000);
  server.send('READER_REGISTER', { payload: { id: 50, token: 'token-suite10' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite10 Reader', success: true } });
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

describe('WebSocket — Crash Report', () => {
  it('device sends READER_CRASH_REPORT after induced crash via debug.crash', async () => {
    // Send crash command without waiting for a response — the device aborts immediately
    await writeSerialRaw('CMND debug.crash {}\n');

    // Wait for device to reboot and reconnect to the mock WS server (requireNew=true
    // ensures we wait for a fresh connection, not the stale pre-crash socket)
    await server.waitForConnection(REBOOT_TIMEOUT_MS, true);

    // Complete re-registration so device proceeds to upload crash report
    await server.waitForMessage('READER_REGISTER', 15_000);
    server.send('READER_REGISTER', { payload: { id: 50, token: 'token-suite10' } });
    await server.waitForMessage('READER_AUTHENTICATE', 15_000);
    server.send('READER_AUTHENTICATED', { payload: { name: 'Suite10 Reader', success: true } });

    // After authentication the device immediately uploads the crash report
    const crashPayload = await server.waitForMessage(
      'READER_CRASH_REPORT',
      CRASH_REPORT_TIMEOUT_MS
    ) as Record<string, unknown>;

    expect(crashPayload).toBeDefined();
    expect(crashPayload).toHaveProperty('resetReason');
    expect(crashPayload).toHaveProperty('heapFreeBytes');
    expect(crashPayload).toHaveProperty('uptimeBeforeResetMs');
    expect(crashPayload).toHaveProperty('firmwareVersion');
    // resetReason should indicate a panic (PANIC or TASK_WDT from abort())
    expect(['PANIC', 'TASK_WDT', 'INT_WDT', 'WDT']).toContain(crashPayload.resetReason);

    // Acknowledge receipt so device clears the stored crash record
    server.send('READER_CRASH_REPORT', { payload: { received: true } });
    await new Promise((r) => setTimeout(r, 1_000));
    expect(server.isConnected).toBe(true);
  });
});
