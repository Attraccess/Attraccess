import type { AttractapReader } from '@attraccess/application-models';
import { Logger } from '@nestjs/common';
import { PluginBleError, type PluginBleContext } from '@attraccess/plugins-backend-sdk';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../../attractap/events';
import type { BleReaderStatus } from './ble-transport-driver';
import { createHostBleHarness, type HostBleHarness } from './__test__/ble-host-harness.test-fixture';
import { BleTestDriver } from './__test__/ble-test-driver.test-fixture';
import { createPluginBleContext } from './plugin-ble-context';
import { clearPluginBleProfiles, getPluginBleProfile, registerPluginBleProfile } from './plugin-ble-profile-registry';

const PROFILE = {
  id: 'demo',
  advertisement: { serviceUuids: ['fff0'] },
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'info', uuid: 'fff1', operations: ['read', 'write'] as const, maxReadBytes: 8, maxWriteBytes: 8 },
      ],
    },
  ],
};
const ADDRESS = 'AA:BB:CC:DD:EE:01';
const silent = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

describe('PluginBleService (host details)', () => {
  let harness: HostBleHarness;
  let ble: PluginBleContext;
  const debug = jest.fn();

  beforeEach(async () => {
    harness = await createHostBleHarness();
    debug.mockClear();
    ble = createPluginBleContext(
      { id: 'plugin-a', logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug } },
      () => harness.service,
    );
    ble.registerProfile(PROFILE as never);
    await harness.addReader({ readerId: 1, name: 'Reader', allowPluginBle: true });
    harness.addPeripheral({
      readerId: 1,
      address: ADDRESS,
      addressType: 'public',
      advertisement: { serviceUuids: ['fff0'] },
      characteristics: { fff1: { value: Uint8Array.of(1, 2, 3) } },
    });
  });

  afterEach(() => harness.dispose());

  const endpoint = () =>
    ble.createEndpoint({ readerId: 1, address: ADDRESS, addressType: 'public', profileId: 'demo' });

  it('lists, updates and deletes an endpoint whose profile is not registered in this process', async () => {
    const created = await endpoint();
    clearPluginBleProfiles();
    await expect(ble.openSession(created.id)).rejects.toMatchObject({ code: 'PROFILE_NOT_REGISTERED' });
    await expect(ble.getEndpoint(created.id)).resolves.toMatchObject({ id: created.id });
    await expect(ble.updateEndpoint(created.id, { label: 'still editable' })).resolves.toMatchObject({
      label: 'still editable',
    });
    await ble.deleteEndpoint(created.id);
    await expect(ble.listEndpoints()).resolves.toEqual([]);
  });

  it('keeps identical profile registrations idempotent across app instances and rejects differing ones', () => {
    const first = registerPluginBleProfile('plugin-x', PROFILE as never);
    expect(registerPluginBleProfile('plugin-x', JSON.parse(JSON.stringify(PROFILE)))).toBe(first);
    expect(getPluginBleProfile('plugin-x', 'demo')).toBe(first);
    expect(getPluginBleProfile('plugin-y', 'demo')).toBeUndefined();
    expect(() => registerPluginBleProfile('plugin-x', { ...PROFILE, limits: { maxSessionMs: 5 } } as never)).toThrow(
      PluginBleError,
    );
  });

  it('only closes sessions when a reader update turns the opt-in off', async () => {
    const created = await endpoint();
    const session = await ble.openSession(created.id);
    await harness.service.onReaderUpdated(new ReaderUpdatedEvent({ id: 1, allowPluginBle: true } as AttractapReader));
    expect(harness.openSessions()).toHaveLength(1);
    await harness.service.onReaderUpdated(new ReaderUpdatedEvent({ id: 2, allowPluginBle: false } as AttractapReader));
    expect(harness.openSessions()).toHaveLength(1);
    // The event bus is shared with plugins: a forged event cannot revoke while the database still says yes.
    await harness.service.onReaderUpdated(new ReaderUpdatedEvent({ id: 1, allowPluginBle: false } as AttractapReader));
    expect(harness.openSessions()).toHaveLength(1);
    await harness.service.onReaderDeleted(new ReaderDeletedEvent(1));
    expect(harness.openSessions()).toHaveLength(1);
    await harness.setReaderAccess(1, false);
    await expect(session.closed).resolves.toEqual({ reason: 'reader-access-revoked' });
  });

  it('fails an open that was in flight when the reader was turned off', async () => {
    const created = await endpoint();
    let release!: (status: BleReaderStatus) => void;
    jest
      .spyOn(harness.driver, 'readerStatus')
      .mockImplementationOnce(() => new Promise<BleReaderStatus>((resolve) => (release = resolve)) as never);
    const opening = ble.openSession(created.id).catch((error: PluginBleError) => error);
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    await harness.setReaderAccess(1, false);
    release({ status: 'available' });
    await expect(opening).resolves.toMatchObject({ code: 'READER_ACCESS_DENIED' });
    expect(harness.openSessions()).toHaveLength(0);
    expect(harness.transcript.map((entry) => entry.op)).not.toContain('connect');
  });

  it('fails an open that was in flight when its endpoint was deleted', async () => {
    const created = await endpoint();
    let release!: (status: BleReaderStatus) => void;
    jest
      .spyOn(harness.driver, 'readerStatus')
      .mockImplementationOnce(() => new Promise<BleReaderStatus>((resolve) => (release = resolve)) as never);
    const opening = ble.openSession(created.id).catch((error: PluginBleError) => error);
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    await ble.deleteEndpoint(created.id);
    release({ status: 'available' });
    await expect(opening).resolves.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });
    expect(harness.transcript.map((entry) => entry.op)).not.toContain('connect');
  });

  it('rejects a scan with TIMEOUT when the transport does not answer in time', async () => {
    let started = false;
    const waitForScan = async () => {
      while (!started) await new Promise((resolve) => setImmediate(resolve));
    };
    jest.spyOn(harness.driver, 'scan').mockImplementationOnce(() => {
      started = true;
      return new Promise(() => undefined);
    });
    const scanning = ble.scan(1, 'demo', { durationMs: 1000 }).catch((error: PluginBleError) => error);
    await waitForScan();
    await harness.advance(5999);
    await harness.advance(1);
    await expect(scanning).resolves.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });

  it('skips malformed advertisements from the transport instead of failing the scan', async () => {
    jest.spyOn(harness.driver, 'scan').mockResolvedValueOnce([
      { address: 'not-an-address', addressType: 'public', serviceUuids: ['fff0'], manufacturerData: [] },
      { address: ADDRESS, addressType: 'public', serviceUuids: ['fff0'], manufacturerData: [] },
    ] as never);
    const results = await ble.scan(1, 'demo');
    expect(results.map((result) => result.address)).toEqual([ADDRESS]);
  });

  it('serializes endpoint writes so two plugins cannot bind one address at the same time', async () => {
    const other = createPluginBleContext({ id: 'plugin-b', logger: silent }, () => harness.service);
    other.registerProfile(PROFILE as never);
    await harness.addReader({ readerId: 2, name: 'Reader 2', allowPluginBle: true });
    const outcomes = await Promise.allSettled([
      ble.createEndpoint({ readerId: 1, address: ADDRESS, addressType: 'public', profileId: 'demo' }),
      other.createEndpoint({ readerId: 2, address: ADDRESS, addressType: 'public', profileId: 'demo' }),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { code: 'ENDPOINT_CONFLICT' },
    });
  });

  it('closes every session on module destroy', async () => {
    const created = await endpoint();
    const session = await ble.openSession(created.id);
    await harness.service.onModuleDestroy();
    await expect(session.closed).resolves.toEqual({ reason: 'shutdown' });
  });

  it('logs operation, outcome and duration at debug level, never payload bytes', async () => {
    const created = await endpoint();
    await ble.withSession(created.id, async (session) => {
      await session.write('info', Uint8Array.of(0xde, 0xad, 0xbe, 0xef));
      await session.read('info');
    });
    const lines = debug.mock.calls.map(([line]) => String(line));
    expect(lines.some((line) => /write .* ok \d+ms/.test(line))).toBe(true);
    expect(lines.some((line) => /read .* ok \d+ms/.test(line))).toBe(true);
    // Random ids could contain the hex digits by chance, so strip them before looking for the payload.
    const text = lines.join('\n').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
    expect(text).not.toMatch(/222|173|190|239|dead|beef|de ?ad ?be ?ef|\[222/i);
  });

  it('applies the profile filter even when the driver returns unrelated advertisements', async () => {
    harness.addPeripheral({
      readerId: 1,
      address: '11:22:33:44:55:66',
      addressType: 'random',
      advertisement: { serviceUuids: ['180f'] },
      characteristics: {},
    });
    const results = await ble.scan(1, 'demo');
    expect(results.map((result) => result.address)).toEqual([ADDRESS]);
  });

  it('wraps unexpected driver failures in INTERNAL without leaking their message', async () => {
    const created = await endpoint();
    const driver: BleTestDriver = harness.driver;
    jest.spyOn(driver, 'connect').mockRejectedValue(new Error('secret key 0xdeadbeef'));
    const failure = await ble.openSession(created.id).catch((error: PluginBleError) => error);
    expect(failure).toMatchObject({ code: 'INTERNAL', retryable: false });
    expect(JSON.stringify([(failure as PluginBleError).message, (failure as PluginBleError).detail])).not.toContain(
      'deadbeef',
    );
  });

  it('records every openSession outcome as the connect operation, refusals before the reader included', async () => {
    const operations = { inc: jest.fn() };
    Object.assign(harness.service, {
      metrics: {
        operations,
        operationDuration: { observe: jest.fn() },
        rejections: { inc: jest.fn() },
        sessionsActive: { inc: jest.fn(), dec: jest.fn() },
        sessionCloses: { inc: jest.fn() },
      },
    });
    const lines: string[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((line) => void lines.push(String(line)));
    jest.spyOn(Logger.prototype, 'debug').mockImplementation((line) => void lines.push(String(line)));
    const created = await endpoint();

    const session = await ble.openSession(created.id);
    await expect(ble.openSession(created.id)).rejects.toMatchObject({ code: 'ENDPOINT_BUSY' });
    await session.close();
    await expect(ble.openSession('forged-endpoint-id')).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });

    expect(operations.inc.mock.calls.map(([labels]) => labels)).toEqual([
      { operation: 'connect', outcome: 'ok' },
      { operation: 'connect', outcome: 'ENDPOINT_BUSY' },
      { operation: 'connect', outcome: 'ENDPOINT_NOT_FOUND' },
    ]);
    const connects = lines.filter((line) => line.startsWith('ble op=connect'));
    expect(connects).toHaveLength(3);
    expect(connects[1]).toMatch(new RegExp(`reader=1 endpoint=${created.id} plugin=plugin-a outcome=ENDPOINT_BUSY`));
    // A plugin-supplied id that resolved to nothing is not echoed into the logs.
    expect(connects[2]).toMatch(/^ble op=connect plugin=plugin-a outcome=ENDPOINT_NOT_FOUND/);
    expect(connects[2]).not.toContain('forged-endpoint-id');
  });

  it('turns a unique-index race into ENDPOINT_CONFLICT', async () => {
    await endpoint();
    // Skip the pre-check, as a concurrent insert that wins the race would: the index still refuses the duplicate.
    jest.spyOn(harness.service as never, 'assertNoConflict').mockResolvedValue(undefined as never);
    await expect(endpoint()).rejects.toMatchObject({ code: 'ENDPOINT_CONFLICT' });
  });
});
