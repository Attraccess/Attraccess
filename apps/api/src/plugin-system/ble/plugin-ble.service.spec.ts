import { Attractap } from '@attraccess/database-entities';
import { PluginBleError, type PluginBleContext } from '@attraccess/plugins-backend-sdk';
import { ReaderUpdatedEvent } from '../../attractap/events';
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
    await harness.service.onReaderUpdated(new ReaderUpdatedEvent({ id: 1, allowPluginBle: true } as Attractap));
    expect(harness.openSessions()).toHaveLength(1);
    await harness.service.onReaderUpdated(new ReaderUpdatedEvent({ id: 2, allowPluginBle: false } as Attractap));
    expect(harness.openSessions()).toHaveLength(1);
    await harness.service.onReaderUpdated(new ReaderUpdatedEvent({ id: 1, allowPluginBle: false } as Attractap));
    await expect(session.closed).resolves.toEqual({ reason: 'reader-access-revoked' });
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
    expect(lines.join('\n')).not.toMatch(/222|173|190|239|dead|beef/i);
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
    expect(JSON.stringify([failure.message, (failure as PluginBleError).detail])).not.toContain('deadbeef');
  });

  it('turns a unique-index race into ENDPOINT_CONFLICT', async () => {
    await endpoint();
    // Skip the pre-check, as a concurrent insert that wins the race would: the index still refuses the duplicate.
    jest.spyOn(harness.service as never, 'assertNoConflict').mockResolvedValue(undefined as never);
    await expect(endpoint()).rejects.toMatchObject({ code: 'ENDPOINT_CONFLICT' });
  });
});
