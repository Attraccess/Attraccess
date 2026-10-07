import type { WaitFreshnessTestScope } from './wago-flow.service.spec';
import type { CanonicalParserConsumerContractTestScope } from './wago-flow.service.spec';
import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';
import { parseOperationalMessage } from './protocol';

export function registerKeepsAPendingWaitThroughStaleAndReplayedMatchesUntilFreshReconnectState(
  scope: WaitFreshnessTestScope,
): void {
  it('keeps a pending wait through stale and replayed matches until fresh reconnect state', async () => {
    const { service } = scope.createService();
    await service.refresh();
    const waiting = service.wait(scope.config);
    await scope.stateMessage(service, 10, { age: 90_001 });
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 10, { age: 90_001 });
    await scope.stateMessage(service, 11, { age: 90_002 });
    expect(service.read(scope.config)).toMatchObject({ sequence: 11 });
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 1, { streamId: scope.STREAM_B });
    await expect(waiting).resolves.toMatchObject({ sequence: 1, value: true });
  });
}

export function registerKeepsFlowReadsAndWaitsAvailableWithIMsOfPositiveClockSkew(scope: WaitFreshnessTestScope): void {
  it.each([42, 2100, 5000])('keeps flow reads and waits available with %i ms of positive clock skew', async (skew) => {
    const { service } = scope.createService();
    await service.refresh();
    await scope.stateMessage(service, 1, { age: -skew });
    const cached = service.read(scope.config);
    expect(cached).not.toBeNull();
    expect(cached && service.payload(cached)).toMatchObject({ available: true, stale: false });
    await expect(service.wait(scope.config)).resolves.toMatchObject({ sequence: 1, value: true });
    await scope.stateMessage(service, 99, { age: -5001 });
    expect(service.read(scope.config)).toMatchObject({ sequence: 1 });
    await jest.advanceTimersByTimeAsync(skew + 90_001);
    expect(cached && service.payload(cached)).toMatchObject({ available: false, stale: true });
  });
}

export function registerKeepsInputAndMeasurementSamplesUnavailableAfterHardwareLossUntilNewSamplesArrive(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('keeps input and measurement samples unavailable after hardware loss until new samples arrive', async () => {
    const { service } = await scope.setup();
    const meter = { ...scope.config, channelId: 'power', category: 'measurement', equals: 500 };
    await scope.snapshot(service, 1, { inputs: { sensor: true } });
    await scope.send(service, 'measurements', 1, scope.measurement);
    await scope.snapshot(service, 2, {
      inputs: { sensor: true },
      readiness: { configurationAccepted: true, hardwareAvailable: false, ready: false, errors: [] },
    });
    const waitingInput = service.wait(scope.config);
    const waitingMeter = service.wait(meter);
    await scope.send(service, 'measurements', 2, scope.measurement);
    expect(service['waiters'].size).toBe(2);
    await scope.snapshot(service, 3, {
      readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true, errors: [] },
    });
    expect(service['waiters'].size).toBe(2);
    await scope.snapshot(service, 4, { inputs: { sensor: true } });
    await scope.send(service, 'measurements', 3, scope.measurement);
    await expect(waitingInput).resolves.toMatchObject({ value: true, sequence: 4 });
    await expect(waitingMeter).resolves.toMatchObject({ value: 500, sequence: 3 });
  });
}

export function registerKeepsMeasurementWaitsUnavailableAcrossInterleavedOfflineTelemetryUntilANewConnectedSampl(
  scope: WaitFreshnessTestScope,
): void {
  it('keeps measurement waits unavailable across interleaved offline telemetry until a new connected sample', async () => {
    const { service, revisionQuery } = scope.createService();
    revisionQuery.getMany.mockResolvedValue([
      {
        ...scope.revision,
        snapshot: JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['measurement'] }] }),
      },
    ]);
    await service.refresh();
    const measurementConfig = { ...scope.config, category: 'measurement', equals: 42 };
    const measurement = (sequence: number) =>
      service['onMessage'](
        2,
        'attraccess/wago',
        'attraccess/wago/v1/controllers/cc100-01/measurements',
        Buffer.from(
          JSON.stringify({
            streamId: scope.STREAM_A,
            sequence,
            timestamp: new Date().toISOString(),
            channelId: 'door',
            unit: 'milliwatt',
            kind: 'live',
            value: 42,
          }),
        ),
      );
    await scope.stateMessage(service, 1, { outputs: {} });
    await measurement(1);
    await scope.stateMessage(service, 2, { connected: false, outputs: {} });
    const waiting = service.wait(measurementConfig);
    await measurement(3);
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 4, { outputs: {} });
    const cached = service.read(measurementConfig);
    expect(cached && service.payload(cached)).toMatchObject({ value: 42, offline: true, available: false });
    await measurement(5);
    await expect(waiting).resolves.toMatchObject({ value: 42, sequence: 5, offline: false });
  });
}

export function registerLoadsOnlyTheLatestAppliedRevisionPerControllerAndPrunesRemovedChannelState(
  scope: WagoFlowServiceTestScope,
): void {
  it('loads only the latest applied revision per controller and prunes removed channel state', async () => {
    const { service, revisionQuery, revisionRepository } = scope.createService();
    await service.refresh();
    await service['onMessage'](
      2,
      'attraccess/wago',
      'attraccess/wago/v1/controllers/cc100-01/state',
      Buffer.from(
        JSON.stringify({
          streamId: scope.STREAM_A,
          sequence: 1,
          timestamp: '2026-08-30T00:00:00.000Z',
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: true },
        }),
      ),
    );
    revisionQuery.getMany.mockResolvedValueOnce([]);

    await service.refresh();

    expect(revisionRepository.find).not.toHaveBeenCalled();
    expect(revisionRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(revisionQuery.innerJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'latest',
      'latest.controllerId = revision.controllerId AND latest.revision = revision.revision',
    );
    expect(service.read({ controllerId: 1, channelId: 'door' })).toBeNull();
  });
}

export function registerOffersStateForInputOnlyChannelsInTheSEditor(scope: WagoFlowServiceTestScope): void {
  it.each(['event', 'read', 'wait'] as const)('offers state for input-only channels in the %s editor', async (kind) => {
    const { service } = scope.createService();
    const originalSnapshot = scope.revision.snapshot;
    scope.revision.snapshot = JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['input'] }] });
    try {
      await service.refresh();

      const schema = await service.resolveConfigSchema({ controllerId: 1, channelId: 'door', category: 'state' }, kind);

      expect((schema.properties as Record<string, { oneOf: Array<{ const: string }> }>).category.oneOf).toEqual([
        { const: 'state', title: 'state' },
        ...(kind === 'event' ? [{ const: 'fault', title: 'fault' }] : []),
      ]);
      if (kind === 'wait') expect(schema).toMatchObject({ properties: { equals: { type: 'boolean' } } });
    } finally {
      scope.revision.snapshot = originalSnapshot;
    }
  });
}

export function registerOnlyEvaluatesWaitersForTheUpdatedChannelState(scope: WagoFlowServiceTestScope): void {
  it('only evaluates waiters for the updated channel state', async () => {
    const { service } = scope.createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (outputs: Record<string, boolean>) =>
      Buffer.from(
        JSON.stringify({
          streamId: scope.STREAM_A,
          sequence: 1,
          timestamp: '2026-08-30T00:00:00.000Z',
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs,
        }),
      );
    const waiting = service.wait({
      controllerId: 1,
      channelId: 'door',
      category: 'state',
      equals: true,
      timeoutMs: 100,
    });
    const read = jest.spyOn(service, 'read');

    await service['onMessage'](2, 'attraccess/wago', topic, event({ door: false }));

    expect(read).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    await expect(waiting).resolves.toBeNull();
  });
}

export function registerPreservesCanonicalMeasurementUnitsWithoutScalingTwiceJ(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it.each([
    { kind: 'live', unit: 'milliampere', value: 500 },
    { kind: 'live', unit: 'millivolt', value: 230_500 },
    { kind: 'cumulative', unit: 'milliwatt-hour', value: 1_234_000 },
  ])('preserves canonical measurement units without scaling twice: %j', async (sample) => {
    const { service } = await scope.setup();
    await scope.snapshot(service, 1);
    const wire = {
      timestamp: new Date().toISOString(),
      streamId: scope.STREAM_A,
      sequence: 1,
      channelId: 'power',
      ...sample,
    };
    expect(
      parseOperationalMessage(
        'attraccess/wago',
        'attraccess/wago/v1/controllers/cc100-01/measurements',
        Buffer.from(JSON.stringify(wire)),
      )?.message,
    ).toMatchObject(wire);
    await scope.send(service, 'measurements', 1, wire);
    const cached = service.read({ ...scope.config, channelId: 'power', category: 'measurement' });
    expect(cached && service.payload(cached)).toMatchObject({ ...wire, available: true });
  });
}
