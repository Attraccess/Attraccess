import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import type { ControllerDiagnosticsTestScope } from './diagnostics.service.spec';
import { WagoDiagnosticsService } from './diagnostics.service';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';

export function registerCheckpointsHeartbeatPersistenceWhileKeepingPermanentConnectivityCurrent(
  _scope: ControllerDiagnosticsTestScope,
): void {
  it('checkpoints heartbeat persistence while keeping permanent connectivity current', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    try {
      const controller = { id: 1, hardwareId: 'cc100', trustState: 'claimed', lastSequence: 0, lastHeartbeatAt: null };
      const save = jest.fn().mockResolvedValue(controller);
      const service = new WagoService({ logger: { warn: jest.fn() } } as unknown as PluginContext);
      Reflect.set(service, 'controllers', { findOneBy: async () => controller, save });
      const heartbeat = Reflect.get(service, 'onHeartbeat').bind(service) as (
        id: string,
        payload: Buffer,
      ) => Promise<void>;
      const payload = Buffer.from(
        JSON.stringify({
          hardwareId: 'cc100',
          protocolVersion: '1.0.0',
          runtimeVersion: '0.1.0',
          capabilities: ['claim', 'heartbeat', 'configuration-v1'],
        }),
      );
      await heartbeat('cc100', payload);
      jest.advanceTimersByTime(10_000);
      await heartbeat('cc100', payload);
      expect(save).toHaveBeenCalledTimes(1);
      expect(service.diagnostics.read(1).heartbeatAt).toBe('2026-09-05T12:00:10.000Z');
      jest.advanceTimersByTime(21_000);
      await heartbeat('cc100', payload);
      expect(save).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
}

export function registerDoesNotSynthesizeSamplesOrFaultsForPrototypeNamedChannelIds(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('does not synthesize samples or faults for prototype-named channel IDs', async () => {
    const { service, latest, revision, snapshot, diagnostics } = scope.setup();
    latest.snapshot = JSON.stringify({
      ...snapshot,
      logicalChannels: ['toString', 'prototype', '__proto__', 'constructor'].map((id) => ({
        ...snapshot.logicalChannels[0],
        id,
      })),
    });
    revision.snapshot = latest.snapshot;
    const empty = await service.get(1);
    expect(
      empty.channels.every(
        (channel) => channel.samples.length === 0 && channel.fault === null && channel.acknowledgement === null,
      ),
    ).toBe(true);
    diagnostics.ingest(
      1,
      'state',
      Buffer.from('{"outputs":{"toString":true,"prototype":false,"__proto__":true,"constructor":false}}'),
    );
    expect((await service.get(1)).channels.map((channel) => channel.samples[0].value)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
}

export function registerGatesCanonicalChannelCurrentStatusOnConnectionSourceStateRevisionsAndFaults(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('gates canonical channel current status on connection, source state, revisions and faults', async () => {
    const { service, diagnostics } = scope.setup();
    const streamId = '00000000-0000-4000-8000-000000000001';
    const send = (kind: string, sequence: number, extra: Record<string, unknown>) =>
      diagnostics.ingest(
        1,
        kind,
        Buffer.from(JSON.stringify({ timestamp: new Date().toISOString(), streamId, sequence, ...extra })),
      );
    const state = (sequence: number, extra: Record<string, unknown> = {}) =>
      send('state', sequence, {
        connected: true,
        revision: 2,
        contentHash: 'a'.repeat(64),
        inputs: { io: true },
        outputs: { io: false },
        ...extra,
      });
    state(1);
    send('measurements', 1, { channelId: 'io', unit: 'millipercent', value: 42000, kind: 'live' });
    let result = await service.get(1);
    expect(result.channels[0].samples.map((value) => value.kind)).toEqual(['input', 'output', 'measurement']);
    expect(result.channels[0].current).toBe(true);
    send('measurements', 2, { channelId: 'io', unit: 'milliwatt-hour', value: 123, kind: 'cumulative' });
    expect(
      (await service.get(1)).channels[0].samples
        .filter((sample) => sample.kind === 'measurement')
        .map((sample) => sample.measurementKind),
    ).toEqual(['live', 'cumulative']);
    expect(result.hardwareReadiness).toBe('unknown');
    state(2, { connected: false });
    result = await service.get(1);
    expect(result.connectivity).toBe('disconnected');
    expect(result.channels[0].current).toBe(false);
    state(3, { inputs: {}, outputs: {} });
    expect((await service.get(1)).channels[0].samples).toEqual([]);
    state(4, { revision: 3 });
    expect(
      (await service.get(1)).channels[0].samples.every(
        (sample) => !sample.current && sample.availabilityReason === 'configuration-mismatch',
      ),
    ).toBe(true);
    state(5, { contentHash: 'b'.repeat(64) });
    expect((await service.get(1)).configuration.revisionMismatch).toBe(true);
    state(6);
    expect(state(999, { readiness: { hardwareAvailable: 'true' } })).toBe(false);
    state(7, { readiness: { hardwareAvailable: false } });
    expect(
      (await service.get(1)).channels[0].samples.every(
        (sample) => !sample.current && sample.availabilityReason === 'hardware-unavailable',
      ),
    ).toBe(true);
    state(8, { readiness: { hardwareAvailable: true } });
    expect((await service.get(1)).hardwareReadiness).toBe('unknown');
    send('faults', 1, { channelId: 'io', code: 'device_write_failed', message: 'SECRET' });
    result = await service.get(1);
    expect(
      result.channels[0].samples.every((sample) => !sample.current && sample.availabilityReason === 'recent-fault'),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
}

export function registerKeepsHardwareReadinessUnknownEvenWhenAppliedSurfacesFaultsAndMismatches(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('keeps hardware readiness unknown even when applied; surfaces faults and mismatches', async () => {
    const { service, diagnostics } = scope.setup();
    diagnostics.ingest(1, 'state', Buffer.from(JSON.stringify({ revision: 1, connected: true })));
    diagnostics.ingest(
      1,
      'faults',
      Buffer.from(JSON.stringify({ channelId: 'removed', code: 'device_write_failed', message: 'SECRET' })),
    );
    const result = await service.get(1);
    expect(result.hardwareReadiness).toBe('unknown');
    expect(result.connectivity).toBe('stale');
    expect(result.configuration.revisionMismatch).toBe(true);
    expect(result.faults[0].channelId).toBe('removed');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
}

export function registerKeepsHealthyResourceControllersAvailableWhenAnotherAppliedSnapshotIsCorrupt(
  _scope: ControllerDiagnosticsTestScope,
): void {
  it('keeps healthy resource controllers available when another applied snapshot is corrupt', async () => {
    const nodes = [
      { id: 'broken', resourceId: 1, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'io' } },
      { id: 'healthy', resourceId: 1, type: 'plugin.wago.command', data: { controllerId: 2, channelId: 'io' } },
    ];
    const query = (result: unknown[]) => {
      const builder = {
        select: jest.fn(),
        distinctOn: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        take: jest.fn(),
        getMany: jest.fn().mockResolvedValue(result),
      };
      for (const method of ['select', 'distinctOn', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'take'] as const)
        builder[method].mockReturnValue(builder);
      return builder;
    };
    const conflictQuery = query([]);
    const resourceQueries = [query(nodes), conflictQuery];
    const context = {
      getRepository: (entity: unknown) => {
        if (entity === WagoController)
          return {
            createQueryBuilder: () =>
              query([
                { id: 1, hardwareId: 'broken' },
                { id: 2, hardwareId: 'healthy' },
              ]),
          };
        if (entity === WagoConfigurationRevision)
          return {
            createQueryBuilder: () =>
              query([
                { controllerId: 1, revision: 1, snapshot: '{' },
                {
                  controllerId: 2,
                  revision: 1,
                  snapshot: JSON.stringify({
                    version: 1,
                    physicalPoints: [],
                    logicalChannels: [{ id: 'io', capabilities: [] }],
                  }),
                },
              ]),
          };
        throw new Error('unexpected repository');
      },
      dataSource: { getRepository: () => ({ createQueryBuilder: () => resourceQueries.shift() }) },
    } as unknown as PluginContext;
    const service = new WagoDiagnosticsService(context, {} as WagoService);

    await expect(service.getResource(1)).resolves.toMatchObject({
      controllers: [
        { controllerId: 1, unavailable: true, references: [] },
        { controllerId: 2, unavailable: false, references: [{ nodeId: 'healthy' }] },
      ],
    });
    expect(conflictQuery.where).toHaveBeenCalledWith("node.data ->> 'controllerId' IN (:...controllerIds)", {
      controllerIds: [1, 2],
    });
  });
}

export function registerKeepsTheAppliedMappingCurrentAfterARejectedPublication(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('keeps the applied mapping current after a rejected publication', async () => {
    const { service, latest, query, diagnostics } = scope.setup();
    diagnostics.ingest(
      1,
      'state',
      Buffer.from(
        JSON.stringify({
          streamId: '00000000-0000-4000-8000-000000000001',
          sequence: 1,
          timestamp: new Date().toISOString(),
          connected: true,
          revision: 2,
          contentHash: 'a'.repeat(64),
          outputs: { io: true },
        }),
      ),
    );
    latest.revision = 3;
    latest.state = 'rejected';
    latest.snapshot = JSON.stringify({ version: 1, physicalPoints: [], logicalChannels: [] });
    query.getMany.mockResolvedValue([
      {
        id: 'node',
        resourceId: 1,
        type: 'plugin.wago.command',
        data: { channelId: 'io', expectedConfigurationRevision: 2 },
      },
    ]);
    const result = await service.get(1);
    expect(result.references[0].invalid).toBe(false);
    expect(result.channels.map((channel) => channel.id)).toEqual(['io']);
    expect(result.configuration.revisionMismatch).toBe(false);
    expect(result.channels[0].samples[0].current).toBe(true);
    expect(result.channels[0].safeState).toBe('not specified');
  });
}
