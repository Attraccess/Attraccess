import type { ControllerDiagnosticsTestScope } from './diagnostics.service.spec';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { configurationHash } from './configuration';

export function registerNeverCallsLegacySamplesCurrentEvenWithAnAppliedRevisionAndRecentHeartbeat(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('never calls legacy samples current even with an applied revision and recent heartbeat', async () => {
    const { service, diagnostics } = scope.setup();
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
}

export function registerOnlyProjectsRejectionSummariesMatchingBothLatestRevisionAndHash(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('only projects rejection summaries matching both latest revision and hash', async () => {
    const { service, diagnostics } = scope.setup();
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
}

export function registerPersistsACanonicalHeartbeatOnlyWithinTheSkewBoundIMs(
  _scope: ControllerDiagnosticsTestScope,
): void {
  it.each([42, 2100, 5000, 5001])('persists a canonical heartbeat only within the skew bound (%i ms)', async (skew) => {
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
            timestamp: new Date(Date.now() + skew).toISOString(),
            streamId: '00000000-0000-4000-8000-000000000001',
            sequence: 1,
          }),
        ),
      );
      if (skew <= 5000) {
        expect(save).toHaveBeenCalledTimes(1);
        expect(controller.lastHeartbeatAt).toBe(new Date(Date.now() + skew).toISOString());
      } else {
        expect(save).not.toHaveBeenCalled();
        expect(controller.lastHeartbeatAt).toBeNull();
      }
    } finally {
      jest.useRealTimers();
    }
  });
}

export function registerPersistsStaleCanonicalSourceTimeAndKeepsItStaleAfterApiRestart(
  scope: ControllerDiagnosticsTestScope,
): void {
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
        stored = { ...stored, ...value };
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
      const restarted = scope.setup(false, stored);
      expect((await restarted.service.get(1)).connectivity).toBe('stale');
      expect((await restarted.service.get(1)).heartbeatFreshness).toBe('stale');
    } finally {
      jest.useRealTimers();
    }
  });
}

export function registerPreservesLegacySequenceWatermarksAndMetadataChangesInsideTheCheckpointWindow(
  _scope: ControllerDiagnosticsTestScope,
): void {
  it('preserves legacy sequence watermarks and metadata changes inside the checkpoint window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    try {
      let stored = { id: 1, hardwareId: 'cc100', trustState: 'claimed', lastSequence: 0, lastHeartbeatAt: null };
      const save = jest.fn(async (value) => {
        stored = { ...stored, ...value };
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
}

export function registerReportsMetadataOnlySavedDraftChangesWithoutReplacingAppliedChannelProjection(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('reports metadata-only saved draft changes without replacing applied channel projection', async () => {
    const draft = {
      snapshot: '{}',
      presetProvenance: JSON.stringify({ editor: { names: { io: 'Renamed' }, presets: [] } }),
    };
    const { service, latest, snapshot } = scope.setup(false, {}, draft);
    draft.snapshot = latest.snapshot;
    latest.contentHash = configurationHash(snapshot);
    expect((await service.get(1)).configuration.draftChanged).toBe(true);
    Object.assign(latest, { presetProvenance: draft.presetProvenance });
    expect((await service.get(1)).configuration.draftChanged).toBe(false);
  });
}

export function registerShowsHeartbeatOnlyLivenessWithoutInventingConnectedChannelState(
  scope: ControllerDiagnosticsTestScope,
): void {
  it('shows heartbeat-only liveness without inventing connected channel state', async () => {
    const { service, diagnostics } = scope.setup();
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
}
