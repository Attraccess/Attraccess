import type { CanonicalParserConsumerContractTestScope } from './wago-flow.service.spec';
import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';

export function registerDropsQueuedEventsFromARetiredBootWhileKeepingTheDispatchQueueBounded(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('drops queued events from a retired boot while keeping the dispatch queue bounded', async () => {
    const { service, trigger } = await scope.setup();
    let release: () => void;
    trigger.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await scope.snapshot(service, 1, { inputs: { sensor: false } });
    await scope.snapshot(service, 2, { inputs: { sensor: true } });
    await jest.advanceTimersByTimeAsync(1);
    await scope.snapshot(service, 1, { inputs: { sensor: false } }, scope.STREAM_B);
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger.mock.calls[1][2]).toMatchObject({ wago: { streamId: scope.STREAM_B, value: false } });
    expect(service['dispatches']).toHaveLength(0);
  });
}

export function registerFailsClosedAtTheRetiredStreamBoundInsteadOfForgettingReplayProtection(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('fails closed at the retired-stream bound instead of forgetting replay protection', async () => {
    const { service } = await scope.setup();
    await scope.snapshot(service, 1);
    for (let index = 1; index <= 129; index++) {
      await jest.advanceTimersByTimeAsync(1);
      const streamId = `33333333-3333-4333-8333-${index.toString().padStart(12, '0')}`;
      await scope.snapshot(service, 1, { inputs: { sensor: true } }, streamId);
    }
    expect(service['streams'].get(1)?.retired.size).toBe(128);
    expect(service['streams'].get(1)?.active).toBe('33333333-3333-4333-8333-000000000128');
    await scope.snapshot(service, 999, { inputs: { sensor: false } }, scope.STREAM_A);
    expect(service.read(scope.config)).toMatchObject({ value: true });
    const cached = service.read(scope.config);
    expect(cached && service.payload(cached)).toMatchObject({ available: false });
    await scope.snapshot(service, 999, { inputs: { sensor: true } }, '33333333-3333-4333-8333-000000000128');
    const waiting = service.wait(scope.config);
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(waiting).resolves.toBeNull();
  });
}

export function registerIdentifiesAnExternalMeterAndKeepsAZeroValuedWaitConditionVisible(
  scope: WagoFlowServiceTestScope,
): void {
  it('identifies an external meter and keeps a zero-valued wait condition visible', async () => {
    const { service, revisionRepository } = scope.createService();
    revisionRepository.find.mockResolvedValue([
      {
        ...scope.revision,
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'power', physicalPointId: 'meter-point', capabilities: ['measurement'] }],
          physicalPoints: [{ id: 'meter-point', hardwareProfile: 'modbus', modbus: { deviceId: 'meter' } }],
          modbus: { devices: [{ id: 'meter', name: 'WAGO 879-3000' }] },
        }),
        presetProvenance: JSON.stringify({ editor: { names: { power: 'Active power' } } }),
      },
    ]);
    const schema = await service.resolveConfigSchema(
      {
        controllerId: 1,
        channelId: 'power',
        category: 'measurement',
        equals: 0,
        timeoutMs: 30_000,
      },
      'wait',
    );
    expect(schema.preview).toMatchObject([
      { label: 'Device', value: 'cc100-01' },
      { label: 'Channel', value: 'Active power · WAGO 879-3000' },
      { label: 'Wait for', value: 'Measurement = 0 (wire value)' },
      { label: 'Timeout', value: '30 s' },
    ]);
  });
}

export function registerIgnoresDuplicateSequencesAndResolvesWaitersFromLaterState(
  scope: WagoFlowServiceTestScope,
): void {
  it('ignores duplicate sequences and resolves waiters from later state', async () => {
    const { service, trigger } = scope.createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number, value: boolean) =>
      Buffer.from(
        JSON.stringify({
          streamId: scope.STREAM_A,
          sequence,
          timestamp: new Date().toISOString(),
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: value },
        }),
      );
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, false));
    const waiting = service.wait({
      controllerId: 1,
      channelId: 'door',
      category: 'state',
      equals: true,
      timeoutMs: 100,
    });
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, true));
    await service['onMessage'](2, 'attraccess/wago', topic, event(2, true));
    await expect(waiting).resolves.toMatchObject({ value: true, sequence: 2 });
    expect(trigger).toHaveBeenCalledTimes(2);
  });
}

export function registerIngestsInputOnlyStateThroughTheRealParserAndDispatchesTypedInputEvents(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('ingests input-only state through the real parser and dispatches typed input events', async () => {
    const { service, trigger } = await scope.setup();
    const waiting = service.wait(scope.config);
    await scope.snapshot(service, 1, { inputs: { sensor: true } });
    await expect(waiting).resolves.toMatchObject({ value: true, streamId: scope.STREAM_A });
    const cached = service.read(scope.config);
    expect(cached && service.payload(cached)).toMatchObject({
      value: true,
      available: true,
      stale: false,
      streamId: scope.STREAM_A,
    });
    expect(trigger).toHaveBeenCalledWith('plugin.wago.event-received', expect.any(Function), {
      wago: expect.objectContaining({ channelId: 'sensor', value: true }),
    });
    expect(trigger.mock.calls[0][1](scope.config, 'input-node')).toBe(true);
  });
}

export function registerInvalidatesAMeasurementFromStaleConnectionEvidenceWhenRecoveryHasTheSameSourceTimestamp(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('invalidates a measurement from stale connection evidence when recovery has the same source timestamp', async () => {
    const { service } = await scope.setup();
    const meter = { ...scope.config, channelId: 'power', category: 'measurement', equals: 500, timeoutMs: 1_000 };
    const sourceTimestamp = new Date().toISOString();
    await scope.snapshot(service, 1, { timestamp: new Date(Date.now() - 90_001).toISOString() });
    await scope.send(service, 'measurements', 1, { ...scope.measurement, timestamp: sourceTimestamp });
    await scope.snapshot(service, 2, { timestamp: sourceTimestamp });

    const cached = service.read(meter);
    expect(cached && service.payload(cached)).toMatchObject({ available: false });
    const waiting = service.wait(meter);
    expect(service['waiters'].size).toBe(1);

    await scope.send(service, 'measurements', 2, { ...scope.measurement, timestamp: sourceTimestamp });
    await expect(waiting).resolves.toMatchObject({ sequence: 2 });
  });
}

export function registerInvalidatesOmittedInputsInANewerCompleteSnapshotJ(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it.each([{ inputs: {} }, { inputs: undefined }])(
    'invalidates omitted inputs in a newer complete snapshot: %j',
    async (missing) => {
      const { service } = await scope.setup();
      await scope.snapshot(service, 1, { inputs: { sensor: true } });
      await scope.snapshot(service, 2, missing);
      const cached = service.read(scope.config);
      expect(cached && service.payload(cached)).toMatchObject({ value: true, available: false });
      const waiting = service.wait(scope.config);
      await scope.snapshot(service, 1, { inputs: { sensor: true } });
      expect(service['waiters'].size).toBe(1);
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(waiting).resolves.toBeNull();
      await scope.snapshot(service, 3, { inputs: { sensor: true } });
      await expect(service.wait(scope.config)).resolves.toMatchObject({ sequence: 3 });
    },
  );
}

export function registerInvalidatesSamplesWhenTheAppliedPhysicalMappingChangesAndRequiresItsReportedRevisionHas(
  scope: CanonicalParserConsumerContractTestScope,
): void {
  it('invalidates samples when the applied physical mapping changes and requires its reported revision/hash', async () => {
    const { service, revisionQuery } = await scope.setup();
    await scope.snapshot(service, 1, { inputs: { sensor: true } });
    revisionQuery.getMany.mockResolvedValue([
      {
        ...scope.revision,
        revision: 2,
        contentHash: 'new-hash',
        snapshot: JSON.stringify({ logicalChannels: scope.channels }),
      },
    ]);
    await service.refresh();
    const waiting = service.wait(scope.config);
    await scope.snapshot(service, 2, { inputs: { sensor: true } });
    expect(service['waiters'].size).toBe(1);
    await scope.snapshot(service, 3, { revision: 2, contentHash: 'wrong-hash', inputs: { sensor: true } });
    expect(service['waiters'].size).toBe(1);
    const cached = service.read(scope.config);
    expect(cached && service.payload(cached)).toMatchObject({
      revision: 2,
      contentHash: 'wrong-hash',
      available: false,
    });
    await scope.snapshot(service, 4, { revision: 2, contentHash: 'new-hash', inputs: { sensor: true } });
    await expect(waiting).resolves.toMatchObject({ revision: 2, contentHash: 'new-hash', value: true });
  });
}

export function registerIsolatesFilteredPreviewControllerLookupsInASharedContext(
  scope: WagoFlowServiceTestScope,
): void {
  it('isolates filtered preview controller lookups in a shared context', async () => {
    const { service, controllerRepository } = scope.createService();
    controllerRepository.find.mockImplementation(async ({ where }: { where: { id: number } }) => [
      { ...scope.controller, id: where.id, hardwareId: `controller-${where.id}` },
    ]);
    const context = new Map<string, unknown>();
    const first = await service.resolveConfigSchema(
      { controllerId: 1, channelId: 'door', category: 'state' },
      'read',
      context,
      true,
    );
    const second = await service.resolveConfigSchema(
      { controllerId: 2, channelId: 'door', category: 'state' },
      'read',
      context,
      true,
    );
    expect(first.preview).toMatchObject([
      { label: 'Device', value: 'controller-1' },
      { label: 'Channel', value: 'door' },
      { label: 'Read', value: 'Output state' },
    ]);
    expect(second.preview).toMatchObject([
      { label: 'Device', value: 'controller-2' },
      { label: 'Channel', value: 'door' },
      { label: 'Read', value: 'Output state' },
    ]);
    expect(controllerRepository.find).toHaveBeenCalledTimes(2);
    await service.resolveConfigSchema({ controllerId: 1, channelId: 'door' }, 'read', context, true);
    expect(controllerRepository.find).toHaveBeenCalledTimes(2);
  });
}

export function registerIsolatesMessagesFromAnotherMqttServerAndAcceptsANewerControllerRestart(
  scope: WagoFlowServiceTestScope,
): void {
  it('isolates messages from another MQTT server and accepts a newer controller restart', async () => {
    const { service } = scope.createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number, timestamp: string, value: boolean, streamId = scope.STREAM_A) =>
      Buffer.from(
        JSON.stringify({
          streamId,
          sequence,
          timestamp,
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: value },
        }),
      );
    await service['onMessage'](3, 'attraccess/wago', topic, event(1, '2026-08-30T00:00:00.000Z', true));
    expect(service.read({ controllerId: 1, channelId: 'door', category: 'state' })).toBeNull();
    await service['onMessage'](2, 'attraccess/wago', topic, event(10, '2026-08-30T00:00:00.000Z', false));
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, new Date().toISOString(), true, scope.STREAM_B));
    expect(service.read({ controllerId: 1, channelId: 'door', category: 'state' })).toMatchObject({
      sequence: 1,
      value: true,
    });
  });
}
