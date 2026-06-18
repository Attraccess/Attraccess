/**
 * Suite 9 — WebSocket: OTA Firmware Update
 *
 * - Server sends READER_FIRMWARE_UPDATE_REQUIRED (size, checksum, version, is_retry=false)
 * - Device sends a sequence of FIRMWARE_REQUEST_CHUNK covering the full binary
 * - Server delivers all chunks as binary WebSocket frames
 * - Device reboots, reconnects, and re-authenticates on the new firmware version
 *
 * The firmware binary used for OTA is the same build that was flashed initially
 * (pointed to by ATTRACTAP_FIRMWARE_BIN env var). This is a self-update that
 * results in the same version — verifying the OTA mechanism, not version gating.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

const FIRMWARE_BIN = process.env.ATTRACTAP_FIRMWARE_BIN ?? '';
const SKIP_OTA = !FIRMWARE_BIN;

const CHUNK_SIZE = 4096;
const OTA_TIMEOUT_MS = 300_000; // 5 min — full OTA transfer + reboot

let server: MockWsServer;
let firmwareBuf: Buffer | null = null;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 15_000);
  server.send('READER_REGISTER', { payload: { id: 40, token: 'token-suite9' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite9 Reader', success: true } });
}

beforeAll(async () => {
  if (SKIP_OTA) return;

  firmwareBuf = await readFile(FIRMWARE_BIN);
  server = createMockServer();
  await openSerial();
  await waitForSerialMessage(/\S/, 60_000);
  await bootstrapSuite(server);
  await authenticate();
});

afterAll(async () => {
  if (SKIP_OTA) return;
  await closeSerial();
  await server.stop();
});

describe('WebSocket — OTA Firmware Update', () => {
  it.skipIf(SKIP_OTA)('device requests all firmware chunks and reboots', async () => {
    const buf = firmwareBuf!;
    const totalSize = buf.length;
    const sha256 = createHash('sha256').update(buf).digest('hex');

    server.send('READER_FIRMWARE_UPDATE_REQUIRED', {
      payload: {
        available: {
          totalSize,
          checksum: sha256,
          version: '99.0.0-e2e',
          is_retry: false,
        },
      },
    });

    // Handle every FIRMWARE_REQUEST_CHUNK by delivering the binary frame
    let chunksDelivered = 0;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OTA chunk delivery timed out after ${OTA_TIMEOUT_MS}ms`));
      }, OTA_TIMEOUT_MS);

      async function deliverNextChunk() {
        try {
          const payload = await server.waitForMessage('FIRMWARE_REQUEST_CHUNK', 30_000) as {
            offset?: number;
            length?: number;
          };
          const offset = payload?.offset ?? 0;
          const length = payload?.length ?? CHUNK_SIZE;
          const slice = buf.slice(offset, offset + length);
          server.sendBinary(slice);
          chunksDelivered++;

          if (offset + length >= totalSize) {
            // All chunks delivered — device will reboot shortly
            clearTimeout(timer);
            resolve();
          } else {
            deliverNextChunk();
          }
        } catch (e) {
          clearTimeout(timer);
          reject(e as Error);
        }
      }

      deliverNextChunk();
    });

    expect(chunksDelivered).toBeGreaterThan(0);
  });

  it.skipIf(SKIP_OTA)('device reconnects and re-authenticates after OTA reboot', async () => {
    // After reboot the device opens a new WS connection
    await server.waitForConnection(60_000, true);
    const _reg = await server.waitForMessage('READER_REGISTER', 30_000);
    expect(_reg).toBeDefined();

    // Complete auth handshake
    server.send('READER_REGISTER', { payload: { id: 40, token: 'token-suite9' } });
    const _auth = await server.waitForMessage('READER_AUTHENTICATE', 15_000);
    expect(_auth).toBeDefined();

    server.send('READER_AUTHENTICATED', { payload: { name: 'Suite9 Reader', success: true } });
    await new Promise((r) => setTimeout(r, 2_000));
    expect(server.isConnected).toBe(true);
  });
});
