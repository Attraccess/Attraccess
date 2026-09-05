import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Contract tests intentionally cross the separately built producer/consumer boundary.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MemoryDeviceAdapter } from '../cc100-runtime/src/adapters';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { JsonStateStore, WagoRuntime, hash, type Snapshot, type Transport } from '../cc100-runtime/src/runtime';
import { encodeMeasurement, MeasurementContractError } from '../measurement-contract';
import * as measurementContract from '../measurement-contract';
import { parseOperationalMessage, type WagoOperationalMessage } from './protocol';

const prefix = 'contract/wago';
const root = `${prefix}/v1/controllers/fixture-cc100`;
const timestamp = '2026-09-05T12:00:00.000Z';
// Same hardware-profile:channel initial-values format used by ATT-1048's simulator.
const fixtures = [
  { channelId: 'current', raw: 0.5, unit: 'ampere', wireUnit: 'milliampere', value: 500, kind: 'live' as const },
  { channelId: 'voltage', raw: 230.5, unit: 'volt', wireUnit: 'millivolt', value: 230500, kind: 'live' as const },
  { channelId: 'power', raw: -12.25, unit: 'watt', wireUnit: 'milliwatt', value: -12250, kind: 'live' as const },
  {
    channelId: 'energy',
    raw: 1234.5,
    unit: 'watt-hour',
    wireUnit: 'milliwatt-hour',
    value: 1234500,
    kind: 'cumulative' as const,
  },
  { channelId: 'level', raw: 12.345, unit: 'percent', wireUnit: 'millipercent', value: 12345, kind: 'live' as const },
];
const snapshot: Snapshot = {
  version: 1,
  physicalPoints: fixtures.map((fixture, channel) => ({ id: fixture.channelId, hardwareProfile: '751-9301', channel })),
  logicalChannels: fixtures.map((fixture) => ({
    id: fixture.channelId,
    physicalPointId: fixture.channelId,
    profile: 'meter',
    capabilities: ['measurement'],
    disconnectPolicy: { mode: 'hold' },
    measurement: { unit: fixture.unit, scale: 1, offset: 0, kind: fixture.kind },
  })),
};

describe('WAGO producer-to-consumer measurement contract', () => {
  let directory: string;
  let store: JsonStateStore;
  let device: MemoryDeviceAdapter;
  let messages: WagoOperationalMessage[];
  let transport: Transport;
  let runtime: WagoRuntime;
  const createRuntime = () =>
    new WagoRuntime({ hardwareId: 'fixture-cc100', pairingCode: '123456', prefix, store, device, transport });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wago-contract-'));
    store = new JsonStateStore(join(directory, 'state.json'));
    device = new MemoryDeviceAdapter();
    fixtures.forEach((fixture, channel) => device.values.set(`751-9301:${channel}`, fixture.raw));
    messages = [];
    transport = {
      subscribe: async () => undefined,
      publish: async (topic, payload) => {
        const parsed = parseOperationalMessage(prefix, topic, Buffer.from(JSON.stringify(payload)));
        if (parsed) {
          expect(parsed.hardwareId).toBe('fixture-cc100');
          expect(payload).not.toHaveProperty('sourceTimestamp');
          messages.push(parsed.message);
        }
      },
    };
    await store.save({ outputs: {}, commandIds: [], accepted: { revision: 7, contentHash: hash(snapshot), snapshot } });
    runtime = createRuntime();
    await runtime.start();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  });

  it('timestamps read completion, before transform and publication delays', async () => {
    jest.useFakeTimers({ now: new Date(timestamp), doNotFake: ['nextTick', 'setImmediate'] });
    let finishRead: (value: number) => void;
    jest.spyOn(device, 'read').mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishRead = resolve;
        }),
    );
    const originalEncode = measurementContract.encodeMeasurement;
    jest.spyOn(measurementContract, 'encodeMeasurement').mockImplementationOnce((...args) => {
      jest.setSystemTime(new Date('2026-09-05T12:00:03.000Z'));
      return originalEncode(...args);
    });
    const pending = runtime.publishMeasurements();
    expect(messages.filter((message) => message.category === 'measurement')).toHaveLength(0);
    jest.setSystemTime(new Date('2026-09-05T12:00:01.000Z'));
    finishRead(0.5);
    await pending;
    expect(messages.find((message) => message.category === 'measurement')).toEqual(
      expect.objectContaining({
        timestamp: '2026-09-05T12:00:01.000Z',
        value: 500,
        unit: 'milliampere',
      }),
    );
    expect(new Date().toISOString()).toBe('2026-09-05T12:00:03.000Z');
  });

  it.each([10_000_000_000_000, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])(
    'preserves persisted whole energy reading %s through the parser when milli-units overflow',
    async (raw) => {
      device.values.set('751-9301:3', raw);
      await runtime.publishMeasurements();
      expect(messages).toContainEqual(
        expect.objectContaining({
          category: 'measurement',
          channelId: 'energy',
          unit: 'watt-hour',
          value: raw,
          kind: 'cumulative',
        }),
      );
      expect((await store.load()).accepted).toEqual({ revision: 7, contentHash: hash(snapshot), snapshot });
    },
  );

  it('preserves physical values from persisted v1 configurations without changing their hash or transforms', async () => {
    await runtime.publishMeasurements();
    const measurements = messages.filter((message) => message.category === 'measurement');
    expect(measurements).toHaveLength(fixtures.length);
    fixtures.forEach((fixture, index) =>
      expect(measurements[index]).toEqual(
        expect.objectContaining({
          channelId: fixture.channelId,
          unit: fixture.wireUnit,
          value: fixture.value,
          kind: fixture.kind,
          sequence: index + 1,
        }),
      ),
    );
    expect((await store.load()).accepted).toEqual({ revision: 7, contentHash: hash(snapshot), snapshot });
  });

  it('keeps sequences contiguous per category across interleaved measurements, state, faults and acknowledgements', async () => {
    await runtime.publishMeasurements();
    await runtime.setConnected(false);
    device.values.set('751-9301:0', NaN);
    await runtime.publishMeasurements();
    await runtime.receiveCommand(
      Buffer.from(JSON.stringify({ id: 'unknown-output', channelId: 'missing', action: 'set', value: true })),
    );
    await runtime.setConnected(true);
    device.values.set('751-9301:0', 0.5);
    await runtime.publishMeasurements();
    expect(new Set(messages.map((message) => message.streamId)).size).toBe(1);
    for (const category of ['state', 'measurement', 'fault', 'acknowledgement']) {
      const events = messages.filter((message) => message.category === category);
      expect(events.length).toBeGreaterThan(0);
      expect(events.map((message) => message.sequence)).toEqual(events.map((_, index) => index + 1));
    }
    expect(messages).toContainEqual(expect.objectContaining({ category: 'fault', code: 'invalid_measurement_value' }));
  });

  it('resumes reserved category sequences under a new stream ID after restoring the same persisted state', async () => {
    await runtime.publishMeasurements();
    const previousStream = messages[0].streamId;
    const previousSequence = Math.max(...messages.map((message) => message.sequence));
    messages.length = 0;
    runtime = createRuntime();
    await runtime.start();
    await runtime.publishMeasurements();
    expect(messages.every((message) => message.streamId !== previousStream)).toBe(true);
    expect(messages.find((message) => message.category === 'state').sequence).toBeGreaterThan(previousSequence);
    expect(messages.find((message) => message.category === 'measurement').sequence).toBeGreaterThan(previousSequence);
  });

  it.each([
    ['unknown unit', { unit: 'unrecognized', scale: 1, offset: 0 }, 'unknown_measurement_unit'],
    ['invalid transform', { unit: 'volt', scale: Infinity, offset: 0 }, 'invalid_measurement_transform'],
  ])(
    'rejects persisted %s before acquisition and preserves the encoder error contract',
    async (_label, transform, code) => {
      const invalid: Snapshot = {
        ...snapshot,
        logicalChannels: [{ ...snapshot.logicalChannels[0], measurement: transform }],
      };
      await store.save({
        outputs: {},
        commandIds: [],
        accepted: { revision: 8, contentHash: hash(invalid), snapshot: invalid },
      });
      const read = jest.spyOn(device, 'read');
      messages.length = 0;
      await expect(createRuntime().start()).rejects.toThrow('persisted configuration is invalid');
      expect(read).not.toHaveBeenCalled();
      expect(messages).toEqual([]);
      expect(() => encodeMeasurement('current', 1, transform)).toThrow(expect.objectContaining({ code }));
    },
  );

  it.each([
    ['boolean reading', { unit: 'volt', scale: 1, offset: 0 }, false, 'invalid_measurement_value'],
    ['fractional milli-unit', { unit: 'volt', scale: 1, offset: 0 }, 0.0005, 'invalid_measurement_transform'],
    [
      'unsafe integer',
      { unit: 'volt', scale: 1, offset: 0 },
      Number.MAX_SAFE_INTEGER + 1,
      'invalid_measurement_transform',
    ],
    [
      'fractional overflow',
      { unit: 'volt', scale: 1, offset: 0 },
      10_000_000_000_000.25,
      'invalid_measurement_transform',
    ],
  ])('faults on %s without publishing a false measurement', async (_label, transform, raw, code) => {
    const invalid: Snapshot = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], measurement: transform }],
    };
    await store.save({
      outputs: {},
      commandIds: [],
      accepted: { revision: 8, contentHash: hash(invalid), snapshot: invalid },
    });
    runtime = createRuntime();
    await runtime.start();
    messages.length = 0;
    device.values.set('751-9301:0', raw);
    await runtime.publishMeasurements();
    expect(messages).toEqual([expect.objectContaining({ category: 'fault', code, channelId: 'current', sequence: 1 })]);
  });
});

describe('simulator wire fixtures and consumer validation', () => {
  it.each(fixtures)('parses the $channelId fixture without changing units or magnitude', (fixture) => {
    const payload = {
      timestamp,
      streamId: 'simulator-boot-1',
      sequence: 1,
      channelId: fixture.channelId,
      kind: fixture.kind,
      unit: fixture.wireUnit,
      value: fixture.value,
    };
    expect(parseOperationalMessage(prefix, `${root}/measurements`, Buffer.from(JSON.stringify(payload)))).toEqual({
      hardwareId: 'fixture-cc100',
      message: { category: 'measurement', ...payload },
    });
  });

  it.each([
    { timestamp: undefined, sourceTimestamp: timestamp },
    { timestamp: '2026-02-30T12:00:00.000Z' },
    { timestamp: '2026-09-05' },
    { streamId: '' },
    { streamId: undefined },
    { sequence: 0 },
    { sequence: 1.5 },
    { value: 0.5 },
    { value: Number.MAX_SAFE_INTEGER + 1 },
    { value: '500' },
    { value: null },
    { unit: 'ampere', value: 0.5 },
    { unit: 'unknown' },
    { kind: 'unknown' },
    { kind: undefined },
    { channelId: '' },
  ])('rejects malformed or legacy ambiguous wire fields: %j', (override) => {
    const payload = {
      timestamp,
      streamId: 'boot-1',
      sequence: 1,
      channelId: 'current',
      kind: 'live',
      unit: 'milliampere',
      value: 500,
      ...override,
    };
    expect(() =>
      parseOperationalMessage(prefix, `${root}/measurements`, Buffer.from(JSON.stringify(payload))),
    ).toThrow();
  });

  it('applies scale and offset in configured physical units before encoding', () => {
    expect(encodeMeasurement('voltage', 23, { unit: 'volt', scale: 10, offset: 0.5 })).toEqual({
      channelId: 'voltage',
      unit: 'millivolt',
      value: 230500,
      kind: 'live',
    });
    expect(() => encodeMeasurement('voltage', Infinity, { unit: 'volt', scale: 1, offset: 0 })).toThrow(
      MeasurementContractError,
    );
  });

  it.each([
    [65536.001, 1, 0, 65536001],
    [-65536.001, 1, 0, -65536001],
    [65536, 1, 0.001, 65536001],
    [655360.01, 0.1, 0, 65536001],
    [0.1, 0.2, 0.28, 300],
    [1e-7, 1e7, 0, 1000],
    [1e20, 1e-10, 0, 1e13],
  ])('encodes decimal raw %s scale %s offset %s without arithmetic noise', (raw, scale, offset, value) => {
    expect(encodeMeasurement('current', raw, { unit: 'ampere', scale, offset })).toEqual({
      channelId: 'current',
      unit: 'milliampere',
      value,
      kind: 'live',
    });
  });

  it.each([
    [65536.001000001, 1, 0],
    [65536.0015, 1, 0],
    [655360.015, 0.1, 0],
    [65536, 1, 0.0015],
    [4_000_000_000_000, 1, 0.0005],
    [10_000_000_000_000, 1, 0.001],
    [Number.MAX_SAFE_INTEGER, 1, 0.1],
    [1e-7, 1, 0],
    [1e308, 1e308, 0],
  ])('rejects real fractional milli-units or unsafe transforms: %s * %s + %s', (raw, scale, offset) => {
    expect(() => encodeMeasurement('current', raw, { unit: 'ampere', scale, offset })).toThrow(
      MeasurementContractError,
    );
  });

  it.each(['ampere', 'volt', 'watt', 'watt-hour', 'percent'])(
    'parses explicit whole-unit fallback %s without rescaling or losing kind',
    (unit) => {
      const encoded = encodeMeasurement('large', 10_000_000_000_000, { unit, scale: 1, offset: 0, kind: 'cumulative' });
      expect(encoded.unit).toBe(unit);
      expect(
        parseOperationalMessage(
          prefix,
          `${root}/measurements`,
          Buffer.from(
            JSON.stringify({
              ...encoded,
              timestamp,
              streamId: 'boot-1',
              sequence: 1,
            }),
          ),
        ).message,
      ).toEqual({ ...encoded, category: 'measurement', timestamp, streamId: 'boot-1', sequence: 1 });
    },
  );
});

describe('ATT-1056 optional state inputs', () => {
  const state = {
    timestamp,
    streamId: 'boot-1',
    sequence: 1,
    connected: true,
    revision: null,
    contentHash: null,
    outputs: {},
  };
  const parse = (payload: object) =>
    parseOperationalMessage(prefix, `${root}/state`, Buffer.from(JSON.stringify(payload))).message;

  it('accepts older state messages without inputs and keeps inputs absent', () => {
    expect(parse(state)).toEqual({ ...state, category: 'state' });
    expect(parse(state)).not.toHaveProperty('inputs');
  });

  it.each([{}, { switch: true, interlock: false }])('preserves a valid inputs boolean map: %j', (inputs) => {
    expect(parse({ ...state, inputs })).toEqual({ ...state, inputs, category: 'state' });
  });

  it.each([
    null,
    [],
    [true],
    'invalid',
    false,
    1,
    { switch: 'invalid' },
    { switch: 1 },
    { switch: null },
    { nested: {} },
  ])('rejects malformed supplied inputs: %j', (inputs) => {
    expect(() => parse({ ...state, inputs })).toThrow('invalid state message');
  });
});
