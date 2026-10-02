import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdirSync, readFileSync } from 'node:fs';
import { SerialDevice, resultsDirectory } from '../helpers/serial';
import { MockServer } from '../mock-server/server';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Hardware acceptance is unverified: missing ${name}`);
  return value;
};
let device: SerialDevice;
const server = new MockServer();
const key = '00112233445566778899aabbccddeeff';
let baselineVersion: string;

async function poll(topic: string, predicate: (value: any) => boolean) {
  await expect.poll(async () => predicate(await device.command(topic)), { timeout: 60000, interval: 1000 }).toBe(true);
}
async function authenticate(connection: number, fresh = false) {
  if (fresh) {
    await server.waitForWebsocketMessage('READER_REGISTER', 0, connection);
    server.sendWebsocketMessage('READER_REGISTER', { id: 267, token: 'hil-reader-token' });
  }
  const message = await server.waitForWebsocketMessage('READER_AUTHENTICATE', 0, connection);
  expect(message.payload).toEqual({ id: 267, token: 'hil-reader-token' });
  const after = server.messages.mark();
  server.sendWebsocketMessage('READER_AUTHENTICATED', { name: 'ATT-267 HIL reader' });
  const info = await server.waitForWebsocketMessage('READER_FIRMWARE_INFO', after, connection);
  await poll('api.status.get', (status) => status.status === 'authenticated' && status.deviceId === '267');
  return info.payload;
}
async function request(command: string, event: string, payload = {}) {
  const after = server.messages.mark();
  expect(await device.command(command, payload)).toEqual({ success: true });
  return (await server.waitForWebsocketMessage(event, after)).payload;
}
async function receive(type: string, payload: unknown, probe: string) {
  const after = device.lines.mark();
  const wsAfter = server.messages.mark();
  server.sendWebsocketMessage(type, payload);
  await server.waitForWebsocketMessage(`ACK_${type}`, wsAfter);
  return device.probe(probe, after);
}

describe.sequential('Unattended real-firmware acceptance', () => {
  beforeAll(async () => {
    mkdirSync(resultsDirectory, { recursive: true });
    device = new SerialDevice(required('ATTRACTAP_SERIAL_PORT'), '1234');
    required('HIL_HOST');
    required('HIL_VARIANT');
    required('HIL_OTA_BIN');
    required('HIL_OTA_VERSION');
    await server.start();
    await device.open();
  });
  afterAll(async () => {
    await device?.close();
    await server.close();
  });

  test('clean boot exposes the real serial provisioning handler', async () => {
    expect(await device.command('auth.status.get', {}, false)).toEqual({ pinIsSet: false });
    expect(await device.command('network.status.get', {}, false)).toEqual({ error: 'PIN_NOT_SET' });
  });
  test('sets the first PIN and gates authenticated commands', async () => {
    expect(await device.command('auth.code.set', { newCode: '1234' }, false)).toEqual({
      success: true,
      pinIsSet: true,
    });
    expect(await device.command('auth.status.get', {}, false)).toEqual({ pinIsSet: true });
    expect(await device.command('network.status.get', {}, false)).toEqual({ error: 'MISSING_AUTH_CODE' });
    expect(await device.command('hil.enable')).toEqual({ success: true });
  });
  test('connects the physical network interface', async () => {
    if (!required('HIL_VARIANT').includes('ethernet')) {
      const ssid = required('HIL_WIFI_SSID');
      const networks = await device.command('network.wifi.ssids.get');
      expect(networks).toEqual(expect.arrayContaining([expect.objectContaining({ ssid })]));
      expect(
        await device.command('network.wifi.credentials.set', { ssid, password: process.env.HIL_WIFI_PASSWORD ?? '' }),
      ).toEqual({ success: true });
      await poll(
        'network.status.get',
        (status) => status.wifi_connected && status.wifi_ssid === ssid && status.wifi_ip.length > 0,
      );
    } else {
      await poll('network.status.get', (status) => status.ethernet_connected && status.ethernet_ip.length > 0);
    }
  });
  test('configures a reachable backend and registers/authenticates the reader', async () => {
    expect(await device.command('api.status.get')).toMatchObject({ status: 'disconnected' });
    expect(
      await device.command('api.configuration.set', {
        hostname: required('HIL_HOST'),
        port: server.port,
        useSSL: false,
      }),
    ).toEqual({ success: true });
    const connection = await server.connections.wait((id) => id > 0);
    await poll('api.status.get', (status) => status.status === 'connected');
    const info = await authenticate(connection, true);
    const variant = required('HIL_VARIANT');
    expect(info.variant).toBe(variant.includes('ethernet') ? 'ethernet' : 'wifi');
    expect(info.name).toBe(
      variant.includes('lite') ? 'attractap_lite' : variant.includes('v2') ? 'attractap_touch_v2' : 'attractap_touch',
    );
    baselineVersion = info.version;
  });
  test('exchanges heartbeats and reauthenticates with persisted credentials after socket loss', async () => {
    const mark = server.messages.mark();
    await server.waitForWebsocketMessage('HEARTBEAT', mark);
    const previous = server.connection;
    server.disconnect();
    const next = await server.connections.wait((id) => id > previous, 0, 60000);
    expect((await authenticate(next)).version).toBe(baselineVersion);
  });
  test('parses a real resource-list callback, including active-session state', async () => {
    const outgoing = await request('hil.resources', 'REQUEST_RESOURCE_LIST');
    expect(outgoing.requestId).toBeGreaterThan(0);
    expect(
      await receive(
        'RESOURCE_LIST',
        {
          requestId: outgoing.requestId,
          revision: 1,
          messageId: 1,
          resources: [
            {
              id: 7,
              name: 'München',
              type: 'machine',
              activeUsageSession: { user: { username: 'operator' }, startTime: '2026-01-01T12:00:00Z' },
            },
          ],
        },
        'resources',
      ),
    ).toEqual({ count: 1, id: 7, name: 'München', active: true });
    expect(
      await receive(
        'RESOURCE_LIST',
        { revision: 2, messageId: 2, resources: [{ id: 7, name: 'München', type: 'machine' }] },
        'resources',
      ),
    ).toMatchObject({ active: false });
  });
  test('serializes card API input and parses returned key material without touching an NFC card', async () => {
    expect(await request('hil.card', 'REQUEST_CARD_AUTHENTICATION_DATA')).toEqual({ uid: '04112233', resourceId: 7 });
    expect(
      await receive(
        'CARD_AUTHENTICATION_DATA',
        { keyNo: 1, key, username: 'operator', requiresSupervisor: true },
        'card',
      ),
    ).toEqual({ username: 'operator', keyNo: 1, keyLen: 16, requiresSupervisor: true, error: '' });
  });
  test.each([
    ['hil.start', 'START_RESOURCE_USAGE_SESSION'],
    ['hil.stop', 'STOP_RESOURCE_USAGE_SESSION'],
    ['hil.lock', 'LOCK_DOOR'],
    ['hil.unlock', 'UNLOCK_DOOR'],
    ['hil.unlatch', 'UNLATCH_DOOR'],
  ])('real API action %s round-trips with request correlation', async (command, type) => {
    const outgoing = await request(command, type);
    expect(outgoing).toMatchObject({ resourceId: 7, requestId: expect.any(Number) });
    expect(outgoing.requestId).toBeGreaterThan(0);
    if (command === 'hil.start') expect(outgoing.projectId).toBe(3);
    expect(await receive(type, { success: true, requestId: outgoing.requestId }, 'action')).toEqual({
      type,
      success: true,
      requestId: outgoing.requestId,
    });
  });
  test('round-trips both supervision protocol stages and resolution', async () => {
    expect(await request('hil.supervision', 'SUPERVISION_REQUEST')).toEqual({ resourceId: 7 });
    expect(
      await receive(
        'SUPERVISION_REQUEST',
        { success: true, timeoutMs: 30000, supervisorNames: ['supervisor'] },
        'supervision',
      ),
    ).toEqual({ success: true, timeoutMs: 30000, count: 1, name: 'supervisor' });
    expect(await request('hil.supervisor', 'REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA')).toEqual({
      uid: '04112233',
      resourceId: 7,
    });
    expect(
      await receive('SUPERVISOR_CARD_AUTHENTICATION_DATA', { username: 'supervisor', keyNo: 2, key }, 'supervisor'),
    ).toEqual({ username: 'supervisor', keyNo: 2, keyLen: 16, error: '' });
    expect(await request('hil.confirm-supervisor', 'SUPERVISOR_CARD_AUTH_CONFIRMED')).toEqual({ resourceId: 7 });
    expect(
      await receive('SUPERVISION_RESOLVED', { success: true, supervisorUsername: 'supervisor' }, 'resolved'),
    ).toEqual({ success: true, username: 'supervisor' });
  });
  test('parses enrollment key exchange and emits cancellation', async () => {
    expect(await receive('ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO', { username: 'operator' }, 'enroll-ready')).toEqual({
      username: 'operator',
    });
    expect(await request('hil.enroll-key', 'ENROLL_NEW_CARD_REQUEST_NFC_KEY')).toEqual({ uid: '04112233', keyNo: 1 });
    expect(await receive('ENROLL_NEW_CARD', { keyNo: 1, key }, 'enroll-key')).toEqual({ keyNo: 1, key });
    expect(await request('hil.enroll-cancel', 'ENROLL_NEW_CARD_CANCEL')).toEqual({});
  });
  test('parses reset key material and emits cancellation', async () => {
    expect(await receive('RESET_NFC_CARD', { username: 'operator', keyNo: 1, key }, 'reset-key')).toEqual({
      username: 'operator',
      keyNo: 1,
      key,
    });
    expect(await request('hil.reset-cancel', 'RESET_NFC_CARD_CANCEL')).toEqual({});
  });
  test('round-trips project pagination and a billing top-up request', async () => {
    expect(await request('hil.projects', 'PROJECTS_OF_USER')).toEqual({ page: 1, limit: 4 });
    expect(
      await receive('PROJECTS_OF_USER', { page: 1, total: 1, projects: [{ id: 3, name: 'Größe' }] }, 'projects'),
    ).toEqual({ page: 1, count: 1, id: 3, name: 'Größe' });
    expect(await request('hil.billing', 'BILLING_REQUEST_TOPUP')).toEqual({ amountCents: 500 });
  });
  test('parses and submits two form pages through production C++ methods', async () => {
    expect(
      await receive(
        'RESOURCE_USAGE_FORM_REQUEST',
        { resourceId: 7, action: 'start', forms: [{ id: 9, name: 'Usage', fieldCount: 2 }] },
        'form-request',
      ),
    ).toEqual({ resourceId: 7, count: 1, formId: 9 });
    for (const offset of [0, 1]) {
      expect(await request('hil.fields', 'RESOURCE_USAGE_FORM_GET_FIELDS', { offset })).toEqual({
        resourceId: 7,
        action: 'start',
        formId: 9,
        offset,
        limit: 1,
      });
      expect(
        await receive(
          'RESOURCE_USAGE_FORM_FIELDS',
          {
            resourceId: 7,
            action: 'start',
            formId: 9,
            offset,
            totalFieldCount: 2,
            fields: [{ id: 11 + offset, type: 'text', name: 'Größe', isRequired: true }],
          },
          'form-fields',
        ),
      ).toEqual({ offset, count: 1, id: 11 + offset, name: 'Größe', type: 1 });
      expect(await request('hil.submit', 'RESOURCE_USAGE_FORM_SUBMIT_PAGE', { offset, fieldId: 11 + offset })).toEqual({
        resourceId: 7,
        action: 'start',
        formId: 9,
        offset,
        answers: [{ fieldId: 11 + offset, value: 'HIL answer' }],
      });
      expect(
        await receive(
          'RESOURCE_USAGE_FORM_PAGE_RESULT',
          { resourceId: 7, action: 'start', formId: 9, offset, valid: true, errors: [] },
          'form-result',
        ),
      ).toEqual({ offset, valid: true, errors: 0 });
    }
  });
  test('streams every OTA byte, reboots into a distinct image and preserves provisioning', async () => {
    const image = readFileSync(required('HIL_OTA_BIN'));
    const version = required('HIL_OTA_VERSION');
    expect(version).not.toBe(baselineVersion);
    const previous = server.connection;
    let after = server.messages.mark();
    server.sendWebsocketMessage('READER_FIRMWARE_UPDATE_REQUIRED', { available: { totalSize: image.length, version } });
    let offset = 0;
    while (offset < image.length) {
      const chunk = await server.waitForWebsocketMessage('FIRMWARE_REQUEST_CHUNK', after, previous);
      after = server.messages.mark();
      expect(chunk.payload).toEqual({ offset, length: Math.min(4096, image.length - offset) });
      server.sendBinary(image.subarray(offset, offset + chunk.payload.length));
      offset += chunk.payload.length;
    }
    expect(offset).toBe(image.length);
    const next = await server.connections.wait((id) => id > previous, 0, 60000);
    expect((await authenticate(next)).version).toBe(version);
    expect(await device.command('auth.status.get', {}, false)).toEqual({ pinIsSet: true });
  });
  test('recovers from a deliberate panic and uploads real boot diagnostics', async () => {
    const previous = server.connection;
    device.sendSerialMessage('debug.crash');
    const next = await server.connections.wait((id) => id > previous, 0, 60000);
    await authenticate(next);
    const report = await server.waitForWebsocketMessage('READER_CRASH_REPORT', 0, next);
    expect(report.payload).toMatchObject({
      resetReason: 'PANIC',
      firmwareVersion: required('HIL_OTA_VERSION'),
      heapFreeBytes: expect.any(Number),
      uptimeBeforeResetMs: expect.any(Number),
    });
    // Coredumps are optional in production (32KiB upload cap); diagnostics are not.
    if (report.payload.coredumpBase64)
      expect(Buffer.from(report.payload.coredumpBase64, 'base64').length).toBeGreaterThan(0);
    const after = device.lines.mark();
    server.sendWebsocketMessage('READER_CRASH_REPORT', { received: true });
    await device.waitForSerialMessage('Crash report accepted; clearing stored record', after);
    expect(await device.command('network.status.get')).not.toHaveProperty('error');
  });
});
