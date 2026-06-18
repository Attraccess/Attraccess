/**
 * Suite 3 — Serial: Network Configuration
 *
 * - network.wifi.ssids.get returns a non-empty SSID list (runner is near a known AP)
 * - network.wifi.credentials.set with valid creds → network.status.get eventually connected
 *
 * Environment variables:
 *   WIFI_SSID    — SSID the device should connect to
 *   WIFI_PASS    — password (may be empty for open networks)
 *   ATTRACTAP_TEST_PIN — 4-digit PIN (default: 1234)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  openSerial,
  closeSerial,
  sendSerialCommand,
  waitForSerialMessage,
} from '../helpers/serial.js';
import { TEST_PIN } from './setup.js';

const BOOT_TIMEOUT_MS = 60_000;
const WIFI_CONNECT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

const WIFI_SSID = process.env.WIFI_SSID ?? '';
const WIFI_PASS = process.env.WIFI_PASS ?? '';

function authPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { authCode: TEST_PIN, ...extra };
}

beforeAll(async () => {
  await openSerial();
  await waitForSerialMessage(/\S/, BOOT_TIMEOUT_MS);
});

afterAll(async () => {
  await closeSerial();
});

describe('Serial — Network Configuration', () => {
  it('network.wifi.ssids.get returns a non-empty SSID list', async () => {
    const resp = await sendSerialCommand<Array<{ ssid: string }>>(
      'network.wifi.ssids.get',
      authPayload(),
      20_000 // WiFi scan can take up to 10 s
    );
    expect(Array.isArray(resp)).toBe(true);
    expect(resp.length).toBeGreaterThan(0);
    expect(resp[0]).toHaveProperty('ssid');
  });

  it('network.wifi.credentials.set succeeds', async () => {
    if (!WIFI_SSID) {
      console.warn('Skipping WiFi credentials test: WIFI_SSID not set');
      return;
    }

    const resp = await sendSerialCommand<{ success?: boolean; error?: string }>(
      'network.wifi.credentials.set',
      authPayload({ ssid: WIFI_SSID, password: WIFI_PASS })
    );
    expect(resp.error).toBeUndefined();
    expect(resp.success).toBe(true);
  });

  it('network.status.get eventually reports wifi_connected after credentials set', async () => {
    if (!WIFI_SSID) {
      console.warn('Skipping WiFi connection test: WIFI_SSID not set');
      return;
    }

    const deadline = Date.now() + WIFI_CONNECT_TIMEOUT_MS;
    let connected = false;

    while (Date.now() < deadline) {
      const resp = await sendSerialCommand<{ wifi_connected: boolean }>(
        'network.status.get',
        authPayload()
      );
      if (resp.wifi_connected) {
        connected = true;
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    expect(connected).toBe(true);
  });
});
