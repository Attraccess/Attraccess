import { prefix, root, timestamp, fixtures, snapshot } from './measurement-contract-fixtures.test-utils';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Contract tests intentionally cross the separately built producer/consumer boundary.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MemoryDeviceAdapter } from '../cc100-runtime/src/adapters';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { JsonStateStore, WagoRuntime, hash, type Transport } from '../cc100-runtime/src/runtime';
import { encodeMeasurement, MeasurementContractError } from '../measurement-contract';
import { parseOperationalMessage, type WagoOperationalMessage } from './protocol';
import { registerTimestampsReadCompletionBeforeTransformAndPublicationDelays } from './measurement-contract.test-cases';
import { registerPreservesPersistedWholeEnergyReadingSThroughTheParserWhenMilliUnitsOverflow } from './measurement-contract.test-cases';
import { registerPreservesPhysicalValuesFromPersistedV1ConfigurationsWithoutChangingTheirHashOrTransforms } from './measurement-contract.test-cases';
import { registerKeepsSequencesContiguousPerCategoryAcrossInterleavedMeasurementsStateFaultsAndAcknowledge } from './measurement-contract.test-cases';
import { registerStartsNewCategorySequencesUnderANewStreamIdAfterRestoringTheSamePersistedState } from './measurement-contract.test-cases';
import { registerFaultsOnSWithoutPublishingAFalseMeasurement } from './measurement-contract.test-cases';

describe('WAGO producer-to-consumer measurement contract', () => {
  defineWagoProducerToConsumerMeasurementContractTests();
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

export function defineWagoProducerToConsumerMeasurementContractTests() {
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
  const scope = {
    get timestamp() {
      return timestamp;
    },
    get device() {
      return device;
    },
    set device(value: typeof device) {
      device = value;
    },
    get runtime() {
      return runtime;
    },
    set runtime(value: typeof runtime) {
      runtime = value;
    },
    get messages() {
      return messages;
    },
    set messages(value: typeof messages) {
      messages = value;
    },
    get store() {
      return store;
    },
    set store(value: typeof store) {
      store = value;
    },
    get snapshot() {
      return snapshot;
    },
    get fixtures() {
      return fixtures;
    },
    get createRuntime() {
      return createRuntime;
    },
  };

  registerTimestampsReadCompletionBeforeTransformAndPublicationDelays(scope);

  registerPreservesPersistedWholeEnergyReadingSThroughTheParserWhenMilliUnitsOverflow(scope);

  registerPreservesPhysicalValuesFromPersistedV1ConfigurationsWithoutChangingTheirHashOrTransforms(scope);

  registerKeepsSequencesContiguousPerCategoryAcrossInterleavedMeasurementsStateFaultsAndAcknowledge(scope);

  registerStartsNewCategorySequencesUnderANewStreamIdAfterRestoringTheSamePersistedState(scope);

  registerFaultsOnSWithoutPublishingAFalseMeasurement(scope);

  return scope;
}

export type WagoProducerToConsumerMeasurementContractTestScope = ReturnType<
  typeof defineWagoProducerToConsumerMeasurementContractTests
>;
