/**
 * Suite 2 — Serial: Initial Authentication Setup
 *
 * Fresh device PIN lifecycle:
 *   - auth.status.get returns { pinIsSet: false }
 *   - Set first PIN via auth.code.set (no currentCode required)
 *   - auth.status.get now returns { pinIsSet: true }
 *   - Commands without PIN return PIN_NOT_SET error
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  openSerial,
  closeSerial,
  sendSerialCommand,
  waitForSerialMessage,
} from '../helpers/serial.js';

const BOOT_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  await openSerial();
  // Wait for boot
  await waitForSerialMessage(/\S/, BOOT_TIMEOUT_MS);
});

afterAll(async () => {
  await closeSerial();
});

describe('Serial — Initial Authentication Setup', () => {
  it('fresh device reports pinIsSet: false', async () => {
    const resp = await sendSerialCommand<{ pinIsSet: boolean }>('auth.status.get');
    expect(resp.pinIsSet).toBe(false);
  });

  it('setting first PIN succeeds without currentCode', async () => {
    const resp = await sendSerialCommand<{ success: boolean; pinIsSet: boolean }>(
      'auth.code.set',
      { newCode: '1234' }
    );
    expect(resp.success).toBe(true);
    expect(resp.pinIsSet).toBe(true);
  });

  it('auth.status.get reports pinIsSet: true after PIN set', async () => {
    const resp = await sendSerialCommand<{ pinIsSet: boolean }>('auth.status.get');
    expect(resp.pinIsSet).toBe(true);
  });

  it('commands that require auth without authCode return an error when PIN is set', async () => {
    // network.status.get requires auth after PIN is set
    const resp = await sendSerialCommand<{ error?: string }>('network.status.get', {});
    expect(resp.error).toBeDefined();
    expect(['MISSING_AUTH_CODE', 'INVALID_AUTH_CODE', 'PIN_NOT_SET']).toContain(resp.error);
  });

  it('auth.code.set rejects invalid PIN format', async () => {
    const resp = await sendSerialCommand<{ error?: string }>(
      'auth.code.set',
      { newCode: 'abc' }
    );
    expect(resp.error).toBe('INVALID_NEW_CODE');
  });
});
