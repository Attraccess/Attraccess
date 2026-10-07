import type { CanonicalParserConsumerContractTestScope } from './wago-flow.service.spec';
import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';
import plugin from './plugin';
import { WagoSettings } from './wago-settings.entity';

export function registerPreservesSourceMetadataAndIndependentCategoryCountersAcrossInterleavingAndBootRestart(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('preserves source metadata and independent category counters across interleaving and boot restart', async () => {
    const { service } = await scope.setup();
    const meter = { ...scope.config, channelId: 'power', category: 'measurement', equals: 500 };
    await scope.snapshot(service, 50, { inputs: { sensor: false } });
    await scope.send(service, 'measurements', 1, scope.measurement);
    await scope.send(service, 'faults', 1, { channelId: 'sensor', code: 'fault', message: 'test fault' });
    await scope.send(service, 'acknowledgements', 1, { id: 'command', status: 'accepted' });
    await scope.snapshot(service, 51, { inputs: { sensor: true } });
    const measured = service.read(meter);
    expect(measured && service.payload(measured)).toMatchObject({
      ...scope.measurement,
      timestamp: new Date().toISOString(),
      streamId: scope.STREAM_A,
      sequence: 1,
      available: true,
    });
    await scope.send(service, 'measurements', 1, { ...scope.measurement, value: 999 });
    expect(service.read(meter)).toMatchObject({ value: 500 });
    // Wall-clock advancement cannot reset a counter in the same boot.
    await jest.advanceTimersByTimeAsync(10);
    await scope.snapshot(service, 1, { inputs: { sensor: false } });
    expect(service.read(scope.config)).toMatchObject({ value: true, sequence: 51 });
    await scope.snapshot(service, 1, { inputs: { sensor: false } }, scope.STREAM_B);
    const waiting = service.wait(meter);
    await scope.send(service, 'measurements', 100, { ...scope.measurement, value: 500 }, scope.STREAM_A);
    await scope.snapshot(service, 100, { inputs: { sensor: true } }, scope.STREAM_A);
    expect(service['waiters'].size).toBe(1);
    expect(service.read(scope.config)).toMatchObject({ value: false, streamId: scope.STREAM_B });
    await scope.send(service, 'measurements', 1, scope.measurement, scope.STREAM_B);
    await expect(waiting).resolves.toMatchObject({
      unit: 'milliwatt',
      kind: 'live',
      streamId: scope.STREAM_B,
      sequence: 1,
    });
  });
}

export function registerProvidesAConciseSPreviewForTheSelectedOutput(scope: WagoFlowServiceTestScope): void {
  it.each(['event', 'read', 'wait'] as const)('provides a concise %s preview for the selected output', async (kind) => {
    const { service } = scope.createService();
    const schema = await service.resolveConfigSchema(
      {
        controllerId: 1,
        channelId: 'door',
        category: 'state',
        equals: false,
        timeoutMs: 1500,
      },
      kind,
    );
    expect(schema.preview).toMatchObject([
      { label: 'Device', value: 'cc100-01' },
      { label: 'Channel', value: 'door' },
      ...(kind === 'event'
        ? [{ label: 'When', value: 'Output state received' }]
        : kind === 'read'
          ? [{ label: 'Read', value: 'Output state' }]
          : [
              { label: 'Wait for', value: 'Output state = OFF' },
              { label: 'Timeout', value: '1.5 s' },
            ]),
    ]);
  });
}

export function registerRegistersThePluginBeforeTheHostDatasourceIsAvailable(scope: WagoFlowServiceTestScope): void {
  it('registers the plugin before the host datasource is available', () => {
    const { context } = scope.createService();
    const getRepository = jest.spyOn(context, 'getRepository').mockImplementation(() => {
      throw new Error('Host DataSource is not available yet');
    });
    getRepository.mockClear();
    expect(() => plugin.register(context)).not.toThrow();
    expect(getRepository).not.toHaveBeenCalled();
  });
}

export function registerRejectsAnInvalidOperationalPrefixBeforeAttemptingMqttSubscriptions(
  scope: WagoFlowServiceTestScope,
): void {
  it('rejects an invalid operational prefix before attempting MQTT subscriptions', async () => {
    const { service, context } = scope.createService();
    const settings = context.getRepository(WagoSettings) as unknown as { findOneBy: jest.Mock };
    settings.findOneBy.mockResolvedValueOnce({ id: 1, defaultMqttServerId: 2, operationalPrefix: 'bad/#' });

    await expect(service.onModuleInit()).rejects.toThrow();
    expect(context.mqtt.subscribe).not.toHaveBeenCalled();
  });
}

export function registerRejectsAnUnseenOldBootWithSourceAgeIWithoutGuessingResetsFromTheClock(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it.each([0, 1])(
    'rejects an unseen old boot with source age %i without guessing resets from the clock',
    async (age) => {
      const { service } = await scope.setup();
      await scope.snapshot(service, 1, { inputs: { sensor: false } });
      await scope.snapshot(
        service,
        1,
        { timestamp: new Date(Date.now() - age).toISOString(), inputs: { sensor: true } },
        scope.STREAM_B,
      );
      expect(service.read(scope.config)).toMatchObject({ value: false, streamId: scope.STREAM_A });
      expect(service['streams'].get(1)?.retired.size).toBe(0);
    },
  );
}

export function registerRejectsInvalidWaitConditionsAndEventFilters(scope: WagoFlowServiceTestScope): void {
  it('rejects invalid wait conditions and event filters', async () => {
    const { service } = scope.createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state' };
    await expect(service.validateConfig({ ...config, equals: 'true', timeoutMs: 0 }, 'wait')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'equals' }),
        expect.objectContaining({ field: 'timeoutMs' }),
      ]),
    );
    await expect(
      service.validateConfig({ ...config, minimumIntervalMs: -1, minimumChange: NaN }, 'event'),
    ).resolves.toHaveLength(2);
  });
}

export function registerRejectsMalformedOperationalMeasurementEnvelopesThroughTheParserJ(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it.each([{ sequence: 0 }, { value: 0.5 }, { unit: 'kilowatt' }, { kind: 'unknown' }])(
    'rejects malformed operational measurement envelopes through the parser: %j',
    async (invalid) => {
      const { service } = await scope.setup();
      await scope.snapshot(service, 1);
      await scope.send(service, 'measurements', 1, { ...scope.measurement, ...invalid });
      expect(service.read({ ...scope.config, channelId: 'power', category: 'measurement' })).toBeNull();
    },
  );
}

export function registerRejectsValuesFromMapsOrCategoriesUnsupportedByTheChannelCapability(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('rejects values from maps or categories unsupported by the channel capability', async () => {
    const { service, trigger } = await scope.setup();
    await scope.snapshot(service, 1, { outputs: { sensor: true, power: true }, inputs: { relay: true } });
    await scope.send(service, 'measurements', 1, { ...scope.measurement, channelId: 'sensor' });
    expect(service.read(scope.config)).toBeNull();
    expect(service.read({ ...scope.config, channelId: 'relay' })).toBeNull();
    expect(service.read({ ...scope.config, channelId: 'power' })).toBeNull();
    expect(trigger).not.toHaveBeenCalled();
  });
}

export function registerRequiresAStateSnapshotToEstablishAnUnseenBootBeforeAcceptingTelemetry(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('requires a state snapshot to establish an unseen boot before accepting telemetry', async () => {
    const { service } = await scope.setup();
    await scope.send(service, 'measurements', 1, scope.measurement);
    expect(service.read({ ...scope.config, channelId: 'power', category: 'measurement' })).toBeNull();
    await scope.snapshot(service, 1);
    await scope.send(service, 'measurements', 2, scope.measurement, scope.STREAM_B);
    expect(service['streams'].get(1)?.active).toBe(scope.STREAM_A);
  });
}

export function registerRequiresFreshConnectedStateEvidenceEvenWhenMeasurementSamplesAreFresh(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('requires fresh connected-state evidence even when measurement samples are fresh', async () => {
    const { service } = await scope.setup();
    await scope.snapshot(service, 1, { timestamp: new Date(Date.now() - 90_001).toISOString() });
    await scope.send(service, 'measurements', 1, scope.measurement);
    const meter = { ...scope.config, channelId: 'power', category: 'measurement', equals: 500 };
    const cached = service.read(meter);
    expect(cached && service.payload(cached)).toMatchObject({
      stale: false,
      connectionStale: true,
      available: false,
    });
    const waiting = service.wait(meter);
    await jest.advanceTimersByTimeAsync(1);
    await scope.snapshot(service, 2);
    expect(cached && service.payload(cached)).toMatchObject({ connectionStale: false, available: false });
    const waitingAfterRecovery = service.wait(meter);
    expect(service['waiters'].size).toBe(2);
    await scope.send(service, 'measurements', 2, scope.measurement);
    await expect(waiting).resolves.toMatchObject({ value: 500, sequence: 2 });
    await expect(waitingAfterRecovery).resolves.toMatchObject({ value: 500, sequence: 2 });
  });
}

export function registerResetsMinimumChangeComparisonsWhenUnitsKindsOrBootStreamsChange(
  scope: WagoFlowServiceTestScope,
): void {
  it('resets minimum-change comparisons when units, kinds or boot streams change', () => {
    const { service } = scope.createService();
    const config = { controllerId: 1, channelId: 'power', category: 'measurement', minimumChange: 10 };
    const previous = {
      controllerId: 1,
      hardwareId: 'cc100-01',
      channelId: 'power',
      category: 'measurement',
      value: 500,
      unit: 'milliampere',
      kind: 'live',
      timestamp: '2026-08-30T00:00:00.000Z',
      sequence: 1,
      streamId: scope.STREAM_A,
      receivedAt: 0,
    } as const;

    expect(service['matchesEvent'](config, 'node', { ...previous, value: 505 }, previous)).toBe(false);
    expect(service['matchesEvent'](config, 'node', { ...previous, value: 520 }, previous)).toBe(true);
    expect(service['matchesEvent'](config, 'node', { ...previous, unit: 'ampere' }, previous)).toBe(true);
    expect(service['matchesEvent'](config, 'node', { ...previous, kind: 'cumulative' }, previous)).toBe(true);
    expect(service['matchesEvent'](config, 'node', { ...previous, streamId: scope.STREAM_B }, previous)).toBe(true);
  });
}

export function registerSerializesConcurrentControllerMessagesBeforeAsynchronousChannelResolution(
  scope: WagoFlowServiceTestScope,
): void {
  it('serializes concurrent controller messages before asynchronous channel resolution', async () => {
    const { service } = scope.createService();
    await service.refresh();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const channels = jest
      .spyOn(
        service as unknown as { channels(id: number): Promise<Array<{ id: string; capabilities: string[] }>> },
        'channels',
      )
      .mockImplementationOnce(async () => {
        await held;
        return [{ id: 'door', capabilities: ['output'] }];
      });
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number) =>
      Buffer.from(
        JSON.stringify({
          streamId: scope.STREAM_A,
          sequence,
          timestamp: new Date().toISOString(),
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: sequence === 2 },
        }),
      );
    const first = service['onMessage'](2, 'attraccess/wago', topic, event(1));
    const second = service['onMessage'](2, 'attraccess/wago', topic, event(2));
    await Promise.resolve();
    await Promise.resolve();
    expect(channels).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(service.read({ controllerId: 1, channelId: 'door' })).toMatchObject({ sequence: 2, value: true });
  });
}
