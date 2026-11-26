import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';
import { AttractapFirmwareHandler } from './handlers/firmware/firmware.handler';
import {
  LEGACY_IDLE_TIMEOUT_MS,
  LEGACY_MAX_CONNECTION_MS,
  LegacyFirmwareUpdateService,
  MAX_LEGACY_CONNECTIONS,
} from './legacy-firmware-update.service';

const LATEST = { name: 'attractap_touch', variant: 'attractap-touch-v2', version: '2.14.0', filename: 'touch.bin' };
const IMAGE = Buffer.alloc(10_000, 7);

class FakeClient extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: Array<string | Buffer> = [];
  send = jest.fn((data: string | Buffer) => void this.sent.push(data));
  close = jest.fn(() => {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  });

  receive(message: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(message)), false);
  }

  /** The events sent so far, by type. */
  events(): Array<{ type: string; payload: Record<string, unknown> }> {
    return this.sent
      .filter((m): m is string => typeof m === 'string')
      .map((m) => JSON.parse(m))
      .filter((m) => m.event === 'EVENT')
      .map((m) => m.data);
  }
}

const event = (type: string, payload: unknown = {}) => ({ event: 'EVENT', data: { type, payload } });
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};

describe('LegacyFirmwareUpdateService', () => {
  let assetsDir: string;
  let service: LegacyFirmwareUpdateService;
  let getFirmwareDefinition: jest.Mock;
  let logged: unknown[];

  beforeEach(() => {
    assetsDir = mkdtempSync(join(tmpdir(), 'legacy-ota-'));
    writeFileSync(join(assetsDir, LATEST.filename), IMAGE);
    process.env.ATTRACTAP_FIRMWARE_ASSETS_DIR = assetsDir;

    getFirmwareDefinition = jest.fn((name: string, variant: string) =>
      name === LATEST.name && variant === LATEST.variant ? LATEST : undefined,
    );
    const firmwareHandler = new AttractapFirmwareHandler();
    Object.assign(firmwareHandler, {
      firmwareService: { getFirmwareDefinition },
      metricsService: { attractapFirmwareUpdatesTotal: { inc: jest.fn() } },
    });
    service = new LegacyFirmwareUpdateService();
    Object.assign(service, {
      firmwareHandler,
      settingsService: { getDefaultLanguage: jest.fn().mockResolvedValue('de') },
    });

    logged = [];
    for (const method of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => void logged.push(args));
    }
  });

  afterEach(() => {
    delete process.env.ATTRACTAP_FIRMWARE_ASSETS_DIR;
    rmSync(assetsDir, { recursive: true, force: true });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const connect = async (licensed: Promise<void> = Promise.resolve()) => {
    const client = new FakeClient();
    service.handleConnection(client as unknown as WebSocket, licensed);
    await flush();
    return client;
  };

  it('updates an old reader that signs in with its token, and logs no token', async () => {
    const client = await connect();
    expect(client.events()).toEqual([{ type: 'READER_REQUEST_AUTHENTICATION', payload: {} }]);

    client.receive(event('READER_AUTHENTICATE', { id: 12, token: 'tok-secret-value' }));
    await flush();
    const authenticated = client.events()[1];
    expect(authenticated.type).toBe('READER_AUTHENTICATED');
    expect(authenticated.payload).toMatchObject({ name: 'Firmware update', language: 'de' });
    expect(authenticated.payload.serverTime).toEqual(
      expect.objectContaining({ epochMs: expect.any(Number), utcOffsetMinutes: expect.any(Number) }),
    );

    client.receive(event('READER_FIRMWARE_INFO', { name: LATEST.name, variant: LATEST.variant, version: '2.5.2' }));
    await flush();
    expect(client.events()[2]).toEqual({
      type: 'READER_FIRMWARE_UPDATE_REQUIRED',
      payload: {
        available: { name: LATEST.name, variant: LATEST.variant, version: '2.14.0', totalSize: IMAGE.length },
      },
    });

    client.receive(event('FIRMWARE_REQUEST_CHUNK', { offset: 0, length: 4096 }));
    client.receive(event('FIRMWARE_REQUEST_CHUNK', { offset: 4096, length: 4096 }));
    client.receive(event('FIRMWARE_REQUEST_CHUNK', { offset: 8192, length: 4096 }));
    await flush();
    const chunks = client.sent.filter((m): m is Buffer => Buffer.isBuffer(m));
    expect(Buffer.concat(chunks)).toEqual(IMAGE);
    expect(client.close).not.toHaveBeenCalled();
    expect(JSON.stringify(logged)).not.toContain('tok-secret-value');
  });

  it('gives an old reader without a token throwaway credentials so it signs in', async () => {
    const client = await connect();

    client.receive(event('READER_REGISTER'));
    await flush();

    const registered = client.events()[1];
    expect(registered.type).toBe('READER_REGISTER');
    expect(registered.payload).toEqual({ id: 0, token: expect.stringMatching(/^[0-9a-f]{32}$/) });
  });

  it('answers heartbeats with the server time', async () => {
    const client = await connect();

    client.receive({ event: 'HEARTBEAT' });
    await flush();

    const heartbeat = JSON.parse(client.sent[1] as string);
    expect(heartbeat).toEqual({ event: 'HEARTBEAT', serverTime: expect.any(Object) });
  });

  it.each([
    ['an unknown variant', { name: LATEST.name, variant: 'attractap-unknown', version: '1.0.0' }],
    ['the latest version already', { name: LATEST.name, variant: LATEST.variant, version: '2.14.0' }],
  ])('closes the connection when it has no update for %s', async (_case, firmware) => {
    const client = await connect();

    client.receive(event('READER_FIRMWARE_INFO', firmware));
    await flush();

    expect(client.events().map((e) => e.type)).not.toContain('READER_FIRMWARE_UPDATE_REQUIRED');
    expect(client.close).toHaveBeenCalled();
    expect(JSON.stringify(logged)).toContain('flash it over USB');
  });

  it('handles nothing else on the connection', async () => {
    const client = await connect();

    client.receive(event('CARD_DETECTED', { uid: '04aabbccdd' }));
    client.receive(event('START_RESOURCE_USAGE_SESSION', { resourceId: 1 }));
    client.receive(event('FIRMWARE_REQUEST_CHUNK', { offset: 0, length: 4096 }));
    client.emit('message', Buffer.from('not json'), false);
    await flush();

    expect(client.sent).toHaveLength(1); // only the sign-in request
    expect(getFirmwareDefinition).not.toHaveBeenCalled();
  });

  it('closes the connection and answers nothing without a license', async () => {
    const client = await connect(Promise.reject(new Error('no license')));

    client.receive(event('READER_AUTHENTICATE', { id: 1, token: 't' }));
    await flush();

    expect(client.close).toHaveBeenCalled();
    expect(client.sent).toEqual([]);
  });

  it(`takes at most ${MAX_LEGACY_CONNECTIONS} old readers at a time`, async () => {
    const clients = await Promise.all(Array.from({ length: MAX_LEGACY_CONNECTIONS }, () => connect()));
    const extra = await connect();

    expect(extra.close).toHaveBeenCalled();
    expect(service.connectionCount).toBe(MAX_LEGACY_CONNECTIONS);

    clients[0].close();
    expect(service.connectionCount).toBe(MAX_LEGACY_CONNECTIONS - 1);
    clients.forEach((c) => c.close());
  });

  describe('a slot is held only by downloading', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
    const info = { name: LATEST.name, variant: LATEST.variant, version: '2.5.2' };

    it('closes a connection that is not offered an update in time, heartbeats or not', async () => {
      const client = await connect();

      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(LEGACY_IDLE_TIMEOUT_MS / 5 - 1);
        client.receive({ event: 'HEARTBEAT' });
        client.receive(event('READER_AUTHENTICATE', { id: 1, token: 't' }));
        await flush();
      }
      expect(client.close).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5);

      expect(client.close).toHaveBeenCalled();
      expect(service.connectionCount).toBe(0);
    });

    it('keeps a reader connected while it requests chunks, and closes it when they stop', async () => {
      const client = await connect();
      client.receive(event('READER_FIRMWARE_INFO', info));
      await flush();

      for (const offset of [0, 4096, 8192]) {
        jest.advanceTimersByTime(LEGACY_IDLE_TIMEOUT_MS - 1);
        client.receive(event('FIRMWARE_REQUEST_CHUNK', { offset, length: 4096 }));
        await flush();
      }
      expect(client.close).not.toHaveBeenCalled();
      client.receive({ event: 'HEARTBEAT' }); // does not count as progress
      await flush();
      jest.advanceTimersByTime(LEGACY_IDLE_TIMEOUT_MS);

      expect(client.close).toHaveBeenCalled();
    });

    it(`ends every connection after ${LEGACY_MAX_CONNECTION_MS / 60_000} minutes`, async () => {
      const client = await connect();
      client.receive(event('READER_FIRMWARE_INFO', info));
      await flush();

      for (
        let elapsed = 0;
        elapsed < LEGACY_MAX_CONNECTION_MS - LEGACY_IDLE_TIMEOUT_MS / 2;
        elapsed += LEGACY_IDLE_TIMEOUT_MS / 2
      ) {
        jest.advanceTimersByTime(LEGACY_IDLE_TIMEOUT_MS / 2);
        client.receive(event('FIRMWARE_REQUEST_CHUNK', { offset: 0, length: 1 }));
        await flush();
      }
      expect(client.close).not.toHaveBeenCalled();
      jest.advanceTimersByTime(LEGACY_IDLE_TIMEOUT_MS / 2);

      expect(client.close).toHaveBeenCalled();
    });
  });
});
