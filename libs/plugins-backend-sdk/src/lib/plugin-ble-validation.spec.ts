import { PLUGIN_BLE_LIMITS, PLUGIN_BLE_RETRYABLE_CODES, PluginBleError, PluginBleErrorCode } from './plugin-ble';
import {
  bleProfilesEqual,
  checkBleInboundPayload,
  matchesBleAdvertisement,
  normalizeBleAddress,
  normalizeBleAdvertisement,
  normalizeBleEndpointInput,
  normalizeBleEndpointUpdate,
  normalizeBleProfile,
  normalizeBleUuid,
  prepareBleRead,
  prepareBleSubscribe,
  prepareBleWrite,
  resolveBleScanDuration,
  resolveBleSessionOptions,
  resolveBleTimeout,
  toBleError,
  validateBleEndpointId,
} from './plugin-ble-validation';

const profile = normalizeBleProfile({
  id: 'demo',
  advertisement: { serviceUuids: ['fff0'], manufacturerIds: [0x004c], namePrefix: 'Demo' },
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        {
          key: 'cmd',
          uuid: 'fff1',
          operations: ['read', 'write', 'writeWithoutResponse'],
          maxReadBytes: 4,
          maxWriteBytes: 4,
        },
        { key: 'evt', uuid: 'fff2', operations: ['indicate'], maxNotificationBytes: 2 },
        { key: 'both', uuid: 'fff3', operations: ['notify', 'indicate'], maxNotificationBytes: 2 },
      ],
    },
  ],
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as PluginBleError).code;
  }
  return undefined;
};

describe('BLE error contract', () => {
  it('marks exactly the documented codes retryable', () => {
    for (const value of Object.values(PluginBleErrorCode)) {
      const error = new PluginBleError(value, 'x');
      expect(error.retryable).toBe(PLUGIN_BLE_RETRYABLE_CODES.includes(value));
    }
    expect([...PLUGIN_BLE_RETRYABLE_CODES].sort()).toEqual(
      [
        'NOT_READY',
        'TRANSPORT_UNAVAILABLE',
        'READER_OFFLINE',
        'READER_BUSY',
        'ENDPOINT_BUSY',
        'TIMEOUT',
        'DEVICE_NOT_FOUND',
        'CONNECTION_FAILED',
        'DISCONNECTED',
      ].sort(),
    );
    expect(Object.keys(PluginBleErrorCode)).toHaveLength(26);
  });

  it('wraps foreign errors without copying their message', () => {
    const wrapped = toBleError(new TypeError('secret bytes'), 'read');
    expect(wrapped).toMatchObject({ code: 'INTERNAL', operation: 'read', detail: 'TypeError' });
    expect(wrapped.message).not.toContain('secret');
    expect(toBleError('text', 'read').detail).toBe('string');
    const original = new PluginBleError('TIMEOUT', 'x');
    expect(toBleError(original, 'read')).toBe(original);
  });
});

describe('UUID and address normalization', () => {
  it.each([
    ['180f', '0000180f-0000-1000-8000-00805f9b34fb'],
    ['180F', '0000180f-0000-1000-8000-00805f9b34fb'],
    ['12345678', '12345678-0000-1000-8000-00805f9b34fb'],
    ['6E400001-B5A3-F393-E0A9-E50E24DCCA9E', '6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
    ['6e400001b5a3f393e0a9e50e24dcca9e', '6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
  ])('normalizes %s', (input, expected) => expect(normalizeBleUuid(input)).toBe(expected));

  it.each(['', 'xyz1', '123', '12345', 'g000', 5, null, '6e400001-b5a3-f393-e0a9'])('rejects %p', (input) =>
    expect(code(() => normalizeBleUuid(input))).toBe('INVALID_PROFILE'),
  );

  it('normalizes addresses and names the field on failure', () => {
    expect(normalizeBleAddress(' aa:bb:cc:dd:ee:0f ')).toBe('AA:BB:CC:DD:EE:0F');
    expect(() => normalizeBleAddress('aabbccddeeff', 'endpoint.address')).toThrow(/endpoint\.address/);
  });
});

describe('profile normalization', () => {
  it('freezes deeply and compares by value', () => {
    expect(Object.isFrozen(profile.services[0].characteristics[0])).toBe(true);
    expect(profile.limits).toEqual({ maxSessionMs: 30_000, maxNotificationQueue: 32 });
    expect(profile.advertisement?.serviceUuids).toEqual(['0000fff0-0000-1000-8000-00805f9b34fb']);
    expect(bleProfilesEqual(profile, normalizeBleProfile({ ...JSON.parse(JSON.stringify(profile)), id: 'demo' }))).toBe(
      true,
    );
    expect(
      bleProfilesEqual(profile, normalizeBleProfile({ ...JSON.parse(JSON.stringify(profile)), id: 'demo2' })),
    ).toBe(false);
  });

  const base = JSON.parse(JSON.stringify(profile));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tweak = (change: (copy: Record<string, any>) => void) => {
    const copy = JSON.parse(JSON.stringify(base));
    change(copy);
    return () => normalizeBleProfile(copy);
  };

  it.each([
    ['null profile', () => normalizeBleProfile(null as never)],
    ['bad id', tweak((p) => (p.id = '-nope'))],
    ['no services', tweak((p) => (p.services = []))],
    ['service not an object', tweak((p) => (p.services = [1]))],
    ['duplicate service', tweak((p) => p.services.push(JSON.parse(JSON.stringify(p.services[0]))))],
    ['no characteristics', tweak((p) => (p.services[0].characteristics = []))],
    ['characteristic not an object', tweak((p) => (p.services[0].characteristics = [null]))],
    ['bad key', tweak((p) => (p.services[0].characteristics[0].key = '1bad'))],
    ['duplicate key', tweak((p) => (p.services[0].characteristics[1].key = 'cmd'))],
    ['duplicate char uuid', tweak((p) => (p.services[0].characteristics[1].uuid = 'fff1'))],
    ['empty operations', tweak((p) => (p.services[0].characteristics[0].operations = []))],
    ['unknown operation', tweak((p) => (p.services[0].characteristics[0].operations = ['erase']))],
    ['duplicate operation', tweak((p) => (p.services[0].characteristics[0].operations = ['read', 'read']))],
    ['missing read bound', tweak((p) => delete p.services[0].characteristics[0].maxReadBytes)],
    ['missing write bound', tweak((p) => delete p.services[0].characteristics[0].maxWriteBytes)],
    ['missing notification bound', tweak((p) => delete p.services[0].characteristics[1].maxNotificationBytes)],
    ['bound zero', tweak((p) => (p.services[0].characteristics[0].maxReadBytes = 0))],
    ['bound fraction', tweak((p) => (p.services[0].characteristics[0].maxReadBytes = 1.5))],
    ['bound above 512', tweak((p) => (p.services[0].characteristics[0].maxReadBytes = 513))],
    // 'evt' only indicates: a read bound is not needed there, but one that is given must still be in range.
    ['disallowed-op bound above 512', tweak((p) => (p.services[0].characteristics[1].maxReadBytes = 513))],
    ['disallowed-op bound zero', tweak((p) => (p.services[0].characteristics[1].maxWriteBytes = 0))],
    ['disallowed-op bound not a number', tweak((p) => (p.services[0].characteristics[1].maxReadBytes = '4'))],
    ['advertisement not object', tweak((p) => (p.advertisement = 'x'))],
    ['advertisement empty', tweak((p) => (p.advertisement = {}))],
    ['advertisement uuids not array', tweak((p) => (p.advertisement.serviceUuids = 'fff0'))],
    ['advertisement duplicate uuid', tweak((p) => (p.advertisement.serviceUuids = ['fff0', 'FFF0']))],
    ['advertisement manufacturer not array', tweak((p) => (p.advertisement.manufacturerIds = 1))],
    ['manufacturer id out of range', tweak((p) => (p.advertisement.manufacturerIds = [0x10000]))],
    ['duplicate manufacturer id', tweak((p) => (p.advertisement.manufacturerIds = [1, 1]))],
    ['empty name prefix', tweak((p) => (p.advertisement.namePrefix = ''))],
    ['limits not object', tweak((p) => (p.limits = 'x'))],
    ['session limit too high', tweak((p) => (p.limits = { maxSessionMs: PLUGIN_BLE_LIMITS.leaseMaxMs + 1 }))],
    ['queue limit too high', tweak((p) => (p.limits = { maxNotificationQueue: 257 }))],
  ])('rejects %s with INVALID_PROFILE', (_name, build) => expect(code(build)).toBe('INVALID_PROFILE'));

  it('drops an in-range bound for an operation that is not allowed', () => {
    const copy = JSON.parse(JSON.stringify(base));
    copy.services[0].characteristics[1].maxReadBytes = 8;
    const normalized = normalizeBleProfile(copy);
    expect(normalized.services[0].characteristics[1]).not.toHaveProperty('maxReadBytes');
    expect(bleProfilesEqual(normalized, profile)).toBe(true);
  });

  it('normalizes operations, service UUIDs and manufacturer ids into one canonical order', () => {
    const define = (operations: string[], serviceUuids: string[], manufacturerIds: number[]) =>
      normalizeBleProfile({
        id: 'ordered',
        advertisement: { serviceUuids, manufacturerIds },
        services: [
          {
            uuid: 'fff0',
            characteristics: [
              { key: 'k', uuid: 'fff1', operations, maxReadBytes: 4, maxWriteBytes: 4, maxNotificationBytes: 4 },
            ],
          },
        ],
      } as never);
    const one = define(['indicate', 'write', 'read', 'writeWithoutResponse', 'notify'], ['fff0', '180f'], [9, 1, 5]);
    const two = define(['read', 'notify', 'writeWithoutResponse', 'indicate', 'write'], ['180f', 'fff0'], [5, 9, 1]);
    expect(one.services[0].characteristics[0].operations).toEqual([
      'read',
      'write',
      'writeWithoutResponse',
      'notify',
      'indicate',
    ]);
    expect(one.advertisement?.serviceUuids).toEqual([
      '0000180f-0000-1000-8000-00805f9b34fb',
      '0000fff0-0000-1000-8000-00805f9b34fb',
    ]);
    expect(one.advertisement?.manufacturerIds).toEqual([1, 5, 9]);
    expect(bleProfilesEqual(one, two)).toBe(true);
    expect(bleProfilesEqual(one, define(['read', 'write'], ['180f', 'fff0'], [5, 9, 1]))).toBe(false);
  });

  it('accepts a profile with the maximum caps and without an advertisement filter', () => {
    const open = normalizeBleProfile({
      id: 'open',
      services: [
        { uuid: 'fff0', characteristics: [{ key: 'a', uuid: 'fff1', operations: ['read'], maxReadBytes: 512 }] },
      ],
      limits: { maxSessionMs: PLUGIN_BLE_LIMITS.leaseMaxMs, maxNotificationQueue: 256 },
    });
    expect(open.advertisement).toBeUndefined();
    expect(open.limits.maxSessionMs).toBe(900_000);
  });
});

describe('operation checks', () => {
  it('rejects unknown keys, UUID keys and non-string keys', () => {
    expect(code(() => prepareBleRead(profile, 'missing'))).toBe('UNKNOWN_CHARACTERISTIC');
    expect(code(() => prepareBleRead(profile, '0000fff1-0000-1000-8000-00805f9b34fb'))).toBe('UNKNOWN_CHARACTERISTIC');
    expect(code(() => prepareBleRead(profile, 5))).toBe('INVALID_ARGUMENT');
  });

  it('checks operations, bounds and value types before anything is sent', () => {
    expect(code(() => prepareBleRead(profile, 'evt'))).toBe('OPERATION_NOT_ALLOWED');
    expect(code(() => prepareBleWrite(profile, 'evt', Uint8Array.of(1)))).toBe('OPERATION_NOT_ALLOWED');
    expect(code(() => prepareBleWrite(profile, 'cmd', new Uint8Array(5)))).toBe('PAYLOAD_TOO_LARGE');
    expect(code(() => prepareBleWrite(profile, 'cmd', new Uint8Array(0)))).toBe('INVALID_ARGUMENT');
    expect(code(() => prepareBleWrite(profile, 'cmd', 'abc'))).toBe('INVALID_ARGUMENT');
    const source = Uint8Array.of(1, 2);
    const prepared = prepareBleWrite(profile, 'cmd', source, true);
    source[0] = 9;
    expect(prepared.value).toEqual(Uint8Array.of(1, 2));
    expect(prepared.withoutResponse).toBe(true);
    expect(prepareBleWrite(profile, 'cmd', Buffer.from([1])).value).toEqual(Uint8Array.of(1));
  });

  describe('judges bytes by their internal slots, never by overridable properties', () => {
    const bulk = normalizeBleProfile({
      id: 'bulk',
      services: [
        {
          uuid: 'fff0',
          characteristics: [
            { key: 'data', uuid: 'fff1', operations: ['write', 'read'], maxWriteBytes: 20, maxReadBytes: 20 },
          ],
        },
      ],
    });
    const data = bulk.services[0].characteristics[0];
    class LyingBytes extends Uint8Array {}
    Object.defineProperty(LyingBytes.prototype, 'byteLength', { get: () => 1 });
    Object.defineProperty(LyingBytes.prototype, 'length', { get: () => 1 });

    it('bounds a subclass with a lying byteLength on its real 100 bytes', () => {
      const lying = new LyingBytes(100);
      expect(lying.byteLength).toBe(1);
      expect(code(() => prepareBleWrite(bulk, 'data', lying))).toBe('PAYLOAD_TOO_LARGE');
      expect(code(() => checkBleInboundPayload(data, 'read', lying))).toBe('PAYLOAD_TOO_LARGE');
      const small = prepareBleWrite(bulk, 'data', new LyingBytes([1, 2, 3])).value;
      expect(small).toEqual(Uint8Array.of(1, 2, 3));
      expect(small.byteLength).toBe(3);
      expect(Object.getPrototypeOf(small)).toBe(Uint8Array.prototype);
    });

    it('ignores an overridden iterator when copying', () => {
      const tricky = Uint8Array.of(1, 2);
      Object.defineProperty(tricky, Symbol.iterator, {
        value: function* () {
          yield* [7, 7, 7, 7];
        },
      });
      expect(prepareBleWrite(bulk, 'data', tricky).value).toEqual(Uint8Array.of(1, 2));
    });

    it.each([
      ['a Proxy over a big Uint8Array', new Proxy(new Uint8Array(100), {})],
      ['a Proxy over a small Uint8Array', new Proxy(Uint8Array.of(1), {})],
      ['a plain object tagged Uint8Array', { [Symbol.toStringTag]: 'Uint8Array', byteLength: 1, length: 1, 0: 1 }],
      ['an object inheriting from Uint8Array.prototype', Object.create(Uint8Array.prototype)],
      ['another typed array', Uint16Array.of(1)],
      ['a DataView', new DataView(new ArrayBuffer(1))],
      ['an ArrayBuffer', new ArrayBuffer(1)],
      ['a number array', [1, 2]],
    ])('rejects %s with INVALID_ARGUMENT', (_label, value) => {
      expect(code(() => prepareBleWrite(bulk, 'data', value))).toBe('INVALID_ARGUMENT');
      expect(code(() => checkBleInboundPayload(data, 'read', value as Uint8Array))).toBe('INTERNAL');
    });

    it('takes a private copy, so later changes to the caller’s buffer do not travel', () => {
      const source = Uint8Array.of(1, 2, 3);
      const prepared = prepareBleWrite(bulk, 'data', source);
      source.fill(9);
      expect(prepared.value).toEqual(Uint8Array.of(1, 2, 3));
      expect(prepared.value.buffer).not.toBe(source.buffer);
      const shared = new Uint8Array(new ArrayBuffer(8), 2, 3);
      shared.set([4, 5, 6]);
      expect(prepareBleWrite(bulk, 'data', shared).value).toEqual(Uint8Array.of(4, 5, 6));
    });
  });

  it('prefers notify over indicate and falls back to indicate', () => {
    expect(prepareBleSubscribe(profile, 'both').indicate).toBe(false);
    expect(prepareBleSubscribe(profile, 'evt').indicate).toBe(true);
    expect(code(() => prepareBleSubscribe(profile, 'cmd'))).toBe('OPERATION_NOT_ALLOWED');
  });

  it('bounds inbound payloads and copies them', () => {
    const characteristic = profile.services[0].characteristics[0];
    expect(code(() => checkBleInboundPayload(characteristic, 'read', new Uint8Array(5)))).toBe('PAYLOAD_TOO_LARGE');
    expect(
      code(() => checkBleInboundPayload(profile.services[0].characteristics[1], 'notification', new Uint8Array(3))),
    ).toBe('PAYLOAD_TOO_LARGE');
    expect(checkBleInboundPayload(characteristic, 'read', Uint8Array.of(1))).toEqual(Uint8Array.of(1));
  });
});

describe('deadlines and options', () => {
  it('applies defaults and caps', () => {
    expect(resolveBleTimeout(undefined, 10, 60)).toBe(10);
    expect(resolveBleTimeout(60, 10, 60)).toBe(60);
    for (const bad of [0, -1, 61, 1.5, '5', NaN])
      expect(code(() => resolveBleTimeout(bad, 10, 60))).toBe('INVALID_ARGUMENT');
    expect(resolveBleScanDuration(undefined)).toBe(5000);
    expect(code(() => resolveBleScanDuration(15_001))).toBe('INVALID_ARGUMENT');
    expect(resolveBleSessionOptions(profile, undefined)).toEqual({ leaseMs: 30_000, connectTimeoutMs: 15_000 });
    expect(code(() => resolveBleSessionOptions(profile, { leaseMs: 30_001 }))).toBe('INVALID_ARGUMENT');
    expect(code(() => resolveBleSessionOptions(profile, { connectTimeoutMs: 60_001 }))).toBe('INVALID_ARGUMENT');
    const short = normalizeBleProfile({
      id: 'short',
      services: [
        { uuid: 'fff0', characteristics: [{ key: 'a', uuid: 'fff1', operations: ['read'], maxReadBytes: 1 }] },
      ],
      limits: { maxSessionMs: 5000 },
    });
    expect(resolveBleSessionOptions(short, undefined).leaseMs).toBe(5000);
  });
});

describe('endpoint input', () => {
  const valid = { readerId: 1, address: 'aa:bb:cc:dd:ee:ff', addressType: 'random' as const, profileId: 'demo' };

  it('normalizes input', () => {
    expect(normalizeBleEndpointInput({ ...valid, label: 'Door' })).toEqual({
      readerId: 1,
      address: 'AA:BB:CC:DD:EE:FF',
      addressType: 'random',
      profileId: 'demo',
      label: 'Door',
    });
    expect(normalizeBleEndpointInput(valid).label).toBeNull();
  });

  it.each([
    ['not an object', null],
    ['reader id', { ...valid, readerId: 0 }],
    ['reader id fraction', { ...valid, readerId: 1.5 }],
    ['address', { ...valid, address: 'nope' }],
    ['address type', { ...valid, addressType: 'static' }],
    ['profile id', { ...valid, profileId: 'Bad Id' }],
    ['label type', { ...valid, label: 5 }],
    ['label length', { ...valid, label: 'x'.repeat(101) }],
  ])('rejects a bad %s with INVALID_ARGUMENT', (_name, input) =>
    expect(code(() => normalizeBleEndpointInput(input as never))).toBe('INVALID_ARGUMENT'),
  );

  it('normalizes updates and refuses profile changes', () => {
    expect(normalizeBleEndpointUpdate({})).toEqual({});
    expect(
      normalizeBleEndpointUpdate({ readerId: 2, address: 'aa:bb:cc:dd:ee:00', addressType: 'public', label: null }),
    ).toEqual({
      readerId: 2,
      address: 'AA:BB:CC:DD:EE:00',
      addressType: 'public',
      label: null,
    });
    expect(code(() => normalizeBleEndpointUpdate({ profileId: 'x' } as never))).toBe('INVALID_ARGUMENT');
    expect(code(() => normalizeBleEndpointUpdate(null as never))).toBe('INVALID_ARGUMENT');
    expect(validateBleEndpointId('abc')).toBe('abc');
    expect(code(() => validateBleEndpointId(''))).toBe('INVALID_ARGUMENT');
  });
});

describe('advertisements', () => {
  const advert = (override = {}) =>
    normalizeBleAdvertisement({
      address: 'aa:bb:cc:dd:ee:ff',
      addressType: 'public',
      rssi: -40,
      name: 'Demo 1',
      serviceUuids: ['fff0'],
      manufacturerData: [{ companyId: 0x004c, data: Uint8Array.of(1) }],
      ...override,
    });

  it('normalizes and copies', () => {
    const source = Uint8Array.of(1);
    const normalized = normalizeBleAdvertisement({
      address: 'aa:bb:cc:dd:ee:ff',
      addressType: 'public',
      serviceUuids: ['180f'],
      manufacturerData: [{ companyId: 1, data: source }],
    });
    source[0] = 2;
    expect(normalized.manufacturerData[0].data).toEqual(Uint8Array.of(1));
    expect(normalized).not.toHaveProperty('rssi');
    expect(advert().rssi).toBe(-40);
  });

  it('requires every criterion the filter sets', () => {
    expect(matchesBleAdvertisement(profile, advert())).toBe(true);
    expect(matchesBleAdvertisement(profile, advert({ serviceUuids: ['180f'] }))).toBe(false);
    expect(matchesBleAdvertisement(profile, advert({ manufacturerData: [] }))).toBe(false);
    expect(matchesBleAdvertisement(profile, advert({ name: 'Other' }))).toBe(false);
    expect(matchesBleAdvertisement(profile, advert({ name: undefined }))).toBe(false);
    const noFilter = normalizeBleProfile({
      id: 'nofilter',
      services: [
        { uuid: 'fff0', characteristics: [{ key: 'a', uuid: 'fff1', operations: ['read'], maxReadBytes: 1 }] },
      ],
    });
    expect(matchesBleAdvertisement(noFilter, advert())).toBe(false);
  });
});
