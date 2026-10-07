import type { WaitFreshnessTestScope } from './wago-flow.service.spec';
import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';
import { WagoController } from './wago-controller.entity';
import type { CanonicalParserConsumerContractTestScope } from './wago-flow.service.spec';
import { encodeMeasurement } from '../measurement-contract';

export function registerAgesAPreviouslyFreshValueUsingSourceTimeWithoutErasingReadableState(
  scope: WaitFreshnessTestScope,
): void {
  it('ages a previously fresh value using source time, without erasing readable state', async () => {
    const { service } = scope.createService();
    await service.refresh();
    await scope.stateMessage(service, 1);
    await jest.advanceTimersByTimeAsync(90_001);
    const cached = service.read(scope.config);
    expect(cached && service.payload(cached)).toMatchObject({ value: true, stale: true, available: false });
    const waiting = service.wait(scope.config);
    service.onModuleDestroy();
    await expect(waiting).resolves.toBeNull();
  });
}

export function registerAppliesMinimumIntervalsFromTheLastDispatchForEachTriggerNode(
  scope: WagoFlowServiceTestScope,
): void {
  it('applies minimum intervals from the last dispatch for each trigger node', () => {
    const { service } = scope.createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state', minimumIntervalMs: 75 };
    const state = (receivedAt: number) =>
      ({
        controllerId: 1,
        hardwareId: 'cc100-01',
        channelId: 'door',
        category: 'state',
        value: true,
        timestamp: '2026-08-30T00:00:00.000Z',
        sequence: receivedAt,
        streamId: scope.STREAM_A,
        receivedAt,
      }) as const;

    expect(service['matchesEvent'](config, 'node-1', state(0))).toBe(true);
    expect(service['matchesEvent'](config, 'node-1', state(50))).toBe(false);
    expect(service['matchesEvent'](config, 'node-1', state(100))).toBe(true);
    expect(service['matchesEvent'](config, 'node-2', state(50))).toBe(true);
  });
}

export function registerBoundsCacheAndQueuedDispatchesWhileStillResolvingWaitsUnderBackpressure(
  scope: WaitFreshnessTestScope,
): void {
  it('bounds cache and queued dispatches while still resolving waits under backpressure', async () => {
    const { service, trigger, revisionQuery } = scope.createService();
    const logicalChannels = Array.from({ length: 2_001 }, (_, index) => ({
      id: `channel-${index}`,
      capabilities: ['output'],
    }));
    revisionQuery.getMany.mockResolvedValue([{ ...scope.revision, snapshot: JSON.stringify({ logicalChannels }) }]);
    let releaseDispatch: () => void;
    trigger.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseDispatch = resolve;
        }),
    );
    await service.refresh();
    const waiting = service.wait({ ...scope.config, channelId: 'channel-2000' });
    await scope.stateMessage(service, 1, { outputs: Object.fromEntries(logicalChannels.map(({ id }) => [id, true])) });
    await expect(waiting).resolves.toMatchObject({ channelId: 'channel-2000', value: true });
    expect(service['cache'].size).toBe(2_000);
    expect(service['dispatches'].length).toBe(100);
    expect(trigger).toHaveBeenCalledTimes(1);
    releaseDispatch();
    await jest.advanceTimersByTimeAsync(0);
    expect(service['dispatches'].length).toBe(0);
  });
}

export function registerCachesAValidatedRetainedStateAndDispatchesMatchingTriggerNodes(
  scope: WagoFlowServiceTestScope,
): void {
  it('caches a validated retained state and dispatches matching trigger nodes', async () => {
    const { service, trigger, context } = scope.createService();
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
    expect(service.read({ controllerId: 1, channelId: 'door' })).toMatchObject({ value: true, sequence: 1 });
    expect(trigger).toHaveBeenCalledWith(
      'plugin.wago.event-received',
      expect.any(Function),
      expect.objectContaining({ wago: expect.objectContaining({ channelId: 'door', value: true }) }),
    );
    expect(context.getRepository(WagoController).findOneBy).not.toHaveBeenCalled();
  });
}

export function registerCancelsPendingStateWaitsDuringShutdown(scope: WagoFlowServiceTestScope): void {
  it('cancels pending state waits during shutdown', async () => {
    const { service } = scope.createService();
    const waiting = service.wait({
      controllerId: 1,
      channelId: 'door',
      category: 'state',
      equals: true,
      timeoutMs: 2_147_483_647,
    });
    service.onModuleDestroy();
    await expect(waiting).resolves.toBeNull();
    expect(service['waiters'].size).toBe(0);
  });
}

export function registerComparesOwnerDefinedOpaqueStreamIdentitiesWithoutAssumingUuidSyntax(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('compares owner-defined opaque stream identities without assuming UUID syntax', async () => {
    const { service } = await scope.setup();
    await scope.snapshot(service, 1, { inputs: { sensor: false } }, 'boot-a');
    expect(service.read(scope.config)).toMatchObject({ streamId: 'boot-a', value: false });
    await jest.advanceTimersByTimeAsync(1);
    await scope.snapshot(service, 1, { inputs: { sensor: true } }, 'boot-b');
    await scope.snapshot(service, 2, { inputs: { sensor: false } }, 'boot-a');
    expect(service.read(scope.config)).toMatchObject({ streamId: 'boot-b', value: true });
    expect(service['streams'].get(1)?.retired.size).toBe(1);
  });
}

export function registerCompletesImmediatelyFromAFreshRetainedMatch(scope: WaitFreshnessTestScope): void {
  it('completes immediately from a fresh retained match', async () => {
    const { service } = scope.createService();
    await service.refresh();
    await scope.stateMessage(service, 1);
    await expect(service.wait(scope.config)).resolves.toMatchObject({ value: true });
    expect(service['waiters'].size).toBe(0);
  });
}

export function registerConsumesTheCommittedEncoderOutputThroughTheParserWithoutRescalingJ(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it.each([
    { raw: 0.5, unit: 'ampere', expectedUnit: 'milliampere', expectedValue: 500 },
    { raw: 230.5, unit: 'volt', expectedUnit: 'millivolt', expectedValue: 230_500 },
    { raw: 42, unit: 'percent', expectedUnit: 'millipercent', expectedValue: 42_000 },
    {
      raw: Number.MAX_SAFE_INTEGER,
      unit: 'watt-hour',
      expectedUnit: 'watt-hour',
      expectedValue: Number.MAX_SAFE_INTEGER,
    },
  ])(
    'consumes the committed encoder output through the parser without rescaling: %j',
    async ({ raw, unit, expectedUnit, expectedValue }) => {
      const { service } = await scope.setup();
      await scope.snapshot(service, 1);
      const encoded = encodeMeasurement('power', raw, { unit, scale: 1, offset: 0, kind: 'live' });
      await scope.send(service, 'measurements', 1, encoded);
      const cached = service.read({ ...scope.config, channelId: 'power', category: 'measurement' });
      expect(cached && service.payload(cached)).toMatchObject({
        unit: expectedUnit,
        value: expectedValue,
        kind: 'live',
        available: true,
      });
    },
  );
}

export function registerDoesNotCompleteFromASCachedMatch(scope: WaitFreshnessTestScope): void {
  it.each([
    ['stale', { age: 90_001 }],
    ['offline', { connected: false }],
  ] as const)('does not complete from a %s cached match', async (_name, options) => {
    const { service } = scope.createService();
    await service.refresh();
    await scope.stateMessage(service, 1, options);
    const cached = service.read(scope.config);
    expect(cached).toMatchObject({ value: true });
    expect(cached && service.payload(cached)).toMatchObject({ available: false });
    const waiting = service.wait(scope.config);
    expect(service['waiters'].size).toBe(1);
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(waiting).resolves.toBeNull();
    expect(service['waitersByKey'].size).toBe(0);
  });
}

export function registerDoesNotLetFutureDatedSamplesBlockFreshUpdatesAfterClockCorrection(
  scope: WaitFreshnessTestScope,
): void {
  it('does not let future-dated samples block fresh updates after clock correction', async () => {
    const { service } = scope.createService();
    await service.refresh();
    const waiting = service.wait(scope.config);
    await scope.stateMessage(service, 10, { age: -60_000 });
    expect(service.read(scope.config)).toBeNull();
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 11, { connected: false });
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 12);
    await expect(waiting).resolves.toMatchObject({ value: true, sequence: 12, offline: false });
  });
}

export function registerDoesNotReviveCachedValuesWhenDisconnectAndReconnectOmitTheChannel(
  scope: WaitFreshnessTestScope,
): void {
  it('does not revive cached values when disconnect and reconnect omit the channel', async () => {
    const { service } = scope.createService();
    await service.refresh();
    await scope.stateMessage(service, 1);
    await scope.stateMessage(service, 2, { connected: false, outputs: {} });
    const cached = service.read(scope.config);
    expect(cached && service.payload(cached)).toMatchObject({ stale: false, offline: true, available: false });
    const waiting = service.wait(scope.config);
    await scope.stateMessage(service, 3, { connected: false });
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 4, { outputs: {} });
    expect(service['waiters'].size).toBe(1);
    await scope.stateMessage(service, 5);
    await expect(waiting).resolves.toMatchObject({ value: true, sequence: 5, offline: false });
  });
}

export function registerDoesNotRevivePreDisconnectMeasurementsDeliveredAfterRecovery(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('does not revive pre-disconnect measurements delivered after recovery', async () => {
    const { service } = await scope.setup();
    await scope.snapshot(service, 1);
    const oldSourceTime = new Date().toISOString();
    await jest.advanceTimersByTimeAsync(10);
    await scope.snapshot(service, 2, { connected: false });
    await jest.advanceTimersByTimeAsync(10);
    await scope.snapshot(service, 3);
    const waiting = service.wait({ ...scope.config, channelId: 'power', category: 'measurement', equals: 500 });
    await scope.send(service, 'measurements', 1, { ...scope.measurement, timestamp: oldSourceTime });
    expect(service['waiters'].size).toBe(1);
    await scope.send(service, 'measurements', 2, scope.measurement);
    await expect(waiting).resolves.toMatchObject({ value: 500, sequence: 2 });
  });
}
