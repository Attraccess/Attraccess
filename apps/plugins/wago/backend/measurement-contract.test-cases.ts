// eslint-disable-next-line @nx/enforce-module-boundaries
import { hash } from '../cc100-runtime/src/runtime';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { Snapshot } from '../cc100-runtime/src/runtime';
import type { WagoProducerToConsumerMeasurementContractTestScope } from './measurement-contract.spec';
import * as measurementContract from '../measurement-contract';

export function registerFaultsOnSWithoutPublishingAFalseMeasurement(
  scope: WagoProducerToConsumerMeasurementContractTestScope,
): void {
  it.each([
    ['unknown unit', { unit: 'unrecognized', scale: 1, offset: 0 }, 1, 'unknown_measurement_unit'],
    ['invalid transform', { unit: 'volt', scale: Infinity, offset: 0 }, 1, 'invalid_measurement_transform'],
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
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], measurement: transform }],
    };
    await scope.store.save({
      outputs: {},
      commandIds: [],
      accepted: { revision: 8, contentHash: hash(invalid), snapshot: invalid },
    });
    scope.runtime = scope.createRuntime();
    await scope.runtime.start();
    scope.messages.length = 0;
    scope.device.values.set('751-9301:0', raw);
    await scope.runtime.publishMeasurements();
    expect(scope.messages).toEqual([
      expect.objectContaining({ category: 'fault', code, channelId: 'current', sequence: 1 }),
    ]);
  });
}

export function registerKeepsSequencesContiguousPerCategoryAcrossInterleavedMeasurementsStateFaultsAndAcknowledge(
  scope: WagoProducerToConsumerMeasurementContractTestScope,
): void {
  it('keeps sequences contiguous per category across interleaved measurements, state, faults and acknowledgements', async () => {
    await scope.runtime.publishMeasurements();
    await scope.runtime.setConnected(false);
    scope.device.values.set('751-9301:0', NaN);
    await scope.runtime.publishMeasurements();
    await scope.runtime.receiveCommand(
      Buffer.from(JSON.stringify({ id: 'unknown-output', channelId: 'missing', action: 'set', value: true })),
    );
    await scope.runtime.setConnected(true);
    scope.device.values.set('751-9301:0', 0.5);
    await scope.runtime.publishMeasurements();
    expect(new Set(scope.messages.map((message) => message.streamId)).size).toBe(1);
    for (const category of ['state', 'measurement', 'fault', 'acknowledgement']) {
      const events = scope.messages.filter((message) => message.category === category);
      expect(events.length).toBeGreaterThan(0);
      expect(events.map((message) => message.sequence)).toEqual(events.map((_, index) => index + 1));
    }
    expect(scope.messages).toContainEqual(
      expect.objectContaining({ category: 'fault', code: 'invalid_measurement_value' }),
    );
  });
}

export function registerPreservesPersistedWholeEnergyReadingSThroughTheParserWhenMilliUnitsOverflow(
  scope: WagoProducerToConsumerMeasurementContractTestScope,
): void {
  it.each([10_000_000_000_000, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])(
    'preserves persisted whole energy reading %s through the parser when milli-units overflow',
    async (raw) => {
      scope.device.values.set('751-9301:3', raw);
      await scope.runtime.publishMeasurements();
      expect(scope.messages).toContainEqual(
        expect.objectContaining({
          category: 'measurement',
          channelId: 'energy',
          unit: 'watt-hour',
          value: raw,
          kind: 'cumulative',
        }),
      );
      expect((await scope.store.load()).accepted).toEqual({
        revision: 7,
        contentHash: hash(scope.snapshot),
        snapshot: scope.snapshot,
      });
    },
  );
}

export function registerPreservesPhysicalValuesFromPersistedV1ConfigurationsWithoutChangingTheirHashOrTransforms(
  scope: WagoProducerToConsumerMeasurementContractTestScope,
): void {
  it('preserves physical values from persisted v1 configurations without changing their hash or transforms', async () => {
    await scope.runtime.publishMeasurements();
    const measurements = scope.messages.filter((message) => message.category === 'measurement');
    expect(measurements).toHaveLength(scope.fixtures.length);
    scope.fixtures.forEach((fixture, index) =>
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
    expect((await scope.store.load()).accepted).toEqual({
      revision: 7,
      contentHash: hash(scope.snapshot),
      snapshot: scope.snapshot,
    });
  });
}

export function registerStartsNewCategorySequencesUnderANewStreamIdAfterRestoringTheSamePersistedState(
  scope: WagoProducerToConsumerMeasurementContractTestScope,
): void {
  it('starts new category sequences under a new stream ID after restoring the same persisted state', async () => {
    await scope.runtime.publishMeasurements();
    const previousStream = scope.messages[0].streamId;
    scope.messages.length = 0;
    scope.runtime = scope.createRuntime();
    await scope.runtime.start();
    await scope.runtime.publishMeasurements();
    expect(scope.messages.every((message) => message.streamId !== previousStream)).toBe(true);
    expect(scope.messages.find((message) => message.category === 'state').sequence).toBe(1);
    expect(scope.messages.find((message) => message.category === 'measurement').sequence).toBe(1);
  });
}

export function registerTimestampsReadCompletionBeforeTransformAndPublicationDelays(
  scope: WagoProducerToConsumerMeasurementContractTestScope,
): void {
  it('timestamps read completion, before transform and publication delays', async () => {
    jest.useFakeTimers({ now: new Date(scope.timestamp), doNotFake: ['nextTick', 'setImmediate'] });
    let finishRead: (value: number) => void;
    jest.spyOn(scope.device, 'read').mockImplementationOnce(
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
    const pending = scope.runtime.publishMeasurements();
    expect(scope.messages.filter((message) => message.category === 'measurement')).toHaveLength(0);
    jest.setSystemTime(new Date('2026-09-05T12:00:01.000Z'));
    finishRead(0.5);
    await pending;
    expect(scope.messages.find((message) => message.category === 'measurement')).toEqual(
      expect.objectContaining({
        timestamp: '2026-09-05T12:00:01.000Z',
        value: 500,
        unit: 'milliampere',
      }),
    );
    expect(new Date().toISOString()).toBe('2026-09-05T12:00:03.000Z');
  });
}
