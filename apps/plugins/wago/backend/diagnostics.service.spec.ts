import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { diagnosticReferences, WagoDiagnosticsService } from './diagnostics.service';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoDiagnosticsStore } from './diagnostics-store';
import { WagoService } from './wago.service';

describe('diagnostic references', () => {
  const node = (id: string, resourceId: number, type = 'command', channelId = 'relay') => ({
    id,
    resourceId,
    type: `plugin.wago.${type}`,
    data: { channelId, expectedConfigurationRevision: 2 },
  });
  it('warns only for cross-resource control and links every invalid node to its real flow', () => {
    const refs = diagnosticReferences(
      [node('a', 1), node('b', 2), node('c', 3, 'read'), node('d', 4, 'event', 'deleted')],
      ['relay'],
      3,
    );
    expect(refs.map((ref) => ref.conflict)).toEqual([true, true, false, false]);
    expect(refs.map((ref) => ref.invalid)).toEqual([true, true, false, true]);
    expect(refs[3]).toMatchObject({ nodeId: 'd', href: '/resources/4/flows?node=d' });
  });
  it('does not conflict for read/event references or control on the same resource', () => {
    const refs = diagnosticReferences([node('a', 1), node('b', 1), node('c', 2, 'read')], ['relay'], 2);
    expect(refs.every((ref) => !ref.conflict && !ref.invalid)).toBe(true);
  });
  it('marks control references invalid when output capability was removed', () => {
    expect(diagnosticReferences([node('a', 1)], ['relay'], 2, { relay: ['input'] })[0].invalid).toBe(true);
  });
  it('validates and detects conflicts using complete channel IDs', () => {
    const channelId = 'channel-'.repeat(20);
    const refs = diagnosticReferences(
      [node('a', 1, 'command', channelId), node('b', 2, 'command', channelId)],
      [channelId],
      2,
    );
    expect(refs.every((ref) => !ref.invalid && ref.conflict)).toBe(true);
  });
  it('encodes node IDs as a single query parameter', () => {
    const id = 'node /?#&+%';
    const [reference] = diagnosticReferences([node(id, 1)], ['relay'], 2);
    const url = new URL(reference.href, 'https://example.test');
    expect(url.pathname).toBe('/resources/1/flows');
    expect(url.searchParams.get('node')).toBe(id);
    expect([...url.searchParams]).toHaveLength(1);
  });
});

describe('controller diagnostics', () => {
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
  it('preserves legacy sequence watermarks and metadata changes inside the checkpoint window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    try {
      let stored = { id: 1, hardwareId: 'cc100', trustState: 'claimed', lastSequence: 0, lastHeartbeatAt: null };
      const save = jest.fn(async (value) => {
        stored = { ...value };
      });
      const service = new WagoService({ logger: { warn: jest.fn() } } as unknown as PluginContext);
      Reflect.set(service, 'controllers', { findOneBy: async () => ({ ...stored }), save });
      const send = (sequence: number, runtimeVersion = '0.1.0') =>
        Reflect.get(service, 'onHeartbeat').call(
          service,
          'cc100',
          Buffer.from(
            JSON.stringify({
              hardwareId: 'cc100',
              protocolVersion: '1.0.0',
              runtimeVersion,
              capabilities: ['claim', 'heartbeat', 'configuration-v1'],
              sequence,
            }),
          ),
        );
      await send(100);
      jest.advanceTimersByTime(10_000);
      await send(200);
      jest.advanceTimersByTime(1_000);
      await send(150);
      expect(service.diagnostics.read(1).heartbeatAt).toBe('2026-09-05T12:00:10.000Z');
      expect(save).toHaveBeenCalledTimes(1);
      await send(201, '0.2.0');
      expect(save).toHaveBeenCalledTimes(2);
      expect(stored).toMatchObject({ lastSequence: 201, runtimeVersion: '0.2.0' });
    } finally {
      jest.useRealTimers();
    }
  });
  it('persists stale canonical source time and keeps it stale after API restart', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    try {
      let stored = {
        id: 1,
        hardwareId: 'cc100',
        trustState: 'claimed',
        capabilities: '[]',
        lastSequence: 0,
        lastHeartbeatAt: null,
      };
      const save = jest.fn(async (value) => {
        stored = { ...value };
      });
      const context = { logger: { warn: jest.fn() } } as unknown as PluginContext;
      const service = new WagoService(context);
      Reflect.set(service, 'controllers', { findOneBy: async () => ({ ...stored }), save });
      const envelope = { streamId: '00000000-0000-4000-8000-000000000001', sequence: 1 };
      service.diagnostics.ingest(
        1,
        'state',
        Buffer.from(
          JSON.stringify({
            ...envelope,
            timestamp: new Date().toISOString(),
            connected: true,
            revision: 2,
            contentHash: 'a'.repeat(64),
            outputs: {},
          }),
        ),
      );
      const send = (sequence: number) =>
        Reflect.get(service, 'onHeartbeat').call(
          service,
          'cc100',
          Buffer.from(
            JSON.stringify({
              ...envelope,
              sequence,
              timestamp: '2026-09-05T11:58:00.000Z',
              hardwareId: 'cc100',
              pairingCode: 'SECRET',
              protocolVersion: '1.0.0',
              runtimeVersion: '0.1.0',
              capabilities: ['claim', 'heartbeat', 'configuration-v1'],
            }),
          ),
        );
      await send(1);
      jest.advanceTimersByTime(10_000);
      await send(2);
      expect(save).toHaveBeenCalledTimes(1);
      expect(stored.lastHeartbeatAt).toBe('2026-09-05T11:58:00.000Z');
      const restarted = setup(false, stored);
      expect((await restarted.service.get(1)).connectivity).toBe('stale');
      expect((await restarted.service.get(1)).heartbeatFreshness).toBe('stale');
    } finally {
      jest.useRealTimers();
    }
  });
  it('does not persist rejected canonical heartbeats as fresh liveness', async () => {
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
      await heartbeat(
        'cc100',
        Buffer.from(
          JSON.stringify({
            hardwareId: 'cc100',
            pairingCode: 'SECRET',
            protocolVersion: '1.0.0',
            runtimeVersion: '0.1.0',
            capabilities: ['claim', 'heartbeat', 'configuration-v1'],
            timestamp: '2026-09-05T12:00:01.000Z',
            streamId: '00000000-0000-4000-8000-000000000001',
            sequence: 1,
          }),
        ),
      );
      expect(save).not.toHaveBeenCalled();
      expect(controller.lastHeartbeatAt).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
  function setup(missing = false, controllerOverrides = {}) {
    const snapshot = {
      version: 1,
      physicalPoints: [],
      logicalChannels: [
        {
          id: 'io',
          profile: 'generic-monitored-input',
          capabilities: ['input', 'output', 'measurement'],
          disconnectPolicy: { mode: 'immediate' },
        },
      ],
    };
    const revision = { revision: 2, state: 'applied', snapshot: JSON.stringify(snapshot), contentHash: 'a'.repeat(64) };
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const context = {
      getRepository: (entity: unknown) =>
        entity === WagoController
          ? {
              findOneBy: async () =>
                missing
                  ? null
                  : {
                      id: 1,
                      trustState: 'claimed',
                      hardwareId: 'cc100',
                      capabilities: '[]',
                      lastHeartbeatAt: null,
                      pairingCodeHash: 'SECRET',
                      ...controllerOverrides,
                    },
            }
          : entity === WagoConfigurationDraft
            ? { findOneBy: async () => null }
            : { findOne: async ({ where }: { where: { state?: string } }) => (where.state ? revision : latest) },
      dataSource: { getRepository: () => ({ createQueryBuilder: () => query }) },
    } as unknown as PluginContext;
    const diagnostics = new WagoDiagnosticsStore();
    const latest = { ...revision };
    return {
      service: new WagoDiagnosticsService(context, { diagnostics } as WagoService),
      diagnostics,
      latest,
      revision,
      query,
      snapshot,
    };
  }
  it('validates flows against applied mapping while reporting publication divergence', async () => {
    const { service, latest, query } = setup();
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
    expect(result.configuration.revisionMismatch).toBe(true);
  });
  it('only projects rejection summaries matching both latest revision and hash', async () => {
    const { service, diagnostics } = setup();
    const report = (revision: number, contentHash: string) =>
      diagnostics.ingest(
        1,
        'configuration/reported',
        Buffer.from(JSON.stringify({ revision, contentHash, errors: [{ path: '$', code: 'invalid_timeout' }] })),
      );
    report(1, 'a'.repeat(64));
    expect((await service.get(1)).configuration.rejectionErrors).toEqual([]);
    report(2, 'b'.repeat(64));
    expect((await service.get(1)).configuration.rejectionErrors).toEqual([]);
    report(2, 'a'.repeat(64));
    expect((await service.get(1)).configuration.rejectionErrors).toHaveLength(1);
  });
  it('does not synthesize samples or faults for prototype-named channel IDs', async () => {
    const { service, latest, snapshot, diagnostics } = setup();
    latest.snapshot = JSON.stringify({
      ...snapshot,
      logicalChannels: ['toString', 'prototype', '__proto__', 'constructor'].map((id) => ({
        ...snapshot.logicalChannels[0],
        id,
      })),
    });
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
  it('returns missing controller as not found', async () => {
    await expect(setup(true).service.get(1)).rejects.toThrow('WAGO controller not found');
  });
  it('shows heartbeat-only liveness without inventing connected channel state', async () => {
    const { service, diagnostics } = setup();
    diagnostics.ingest(
      1,
      'heartbeat',
      Buffer.from(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          streamId: '00000000-0000-4000-8000-000000000001',
          sequence: 1,
        }),
      ),
    );
    const result = await service.get(1);
    expect(result.connectivity).toBe('online');
    expect(result.stateConnected).toBeNull();
    expect(result.channels.every((channel) => !channel.current && channel.samples.length === 0)).toBe(true);
  });

  it('keeps hardware readiness unknown even when applied; surfaces faults and mismatches', async () => {
    const { service, diagnostics } = setup();
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
  it('gates canonical channel current status on connection, source state, revisions and faults', async () => {
    const { service, diagnostics } = setup();
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
  it('never calls legacy samples current even with an applied revision and recent heartbeat', async () => {
    const { service, diagnostics } = setup();
    diagnostics.ingest(1, 'heartbeat', Buffer.from('{}'));
    diagnostics.ingest(
      1,
      'state',
      Buffer.from(JSON.stringify({ connected: true, revision: 2, outputs: { io: true }, inputs: { io: false } })),
    );
    const result = await service.get(1);
    expect(result.channels[0].samples.every((sample) => sample.sourceFreshness === 'missing')).toBe(true);
    expect(result.channels[0].current).toBe(false);
    expect(result.hardwareReadiness).toBe('unknown');
  });
});
