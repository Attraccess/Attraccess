import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { diagnosticReferences, WagoDiagnosticsService } from './diagnostics.service';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoDiagnosticsStore } from './diagnostics-store';
import { WagoService } from './wago.service';
import { registerKeepsHealthyResourceControllersAvailableWhenAnotherAppliedSnapshotIsCorrupt } from './diagnostics.service.checkpoints-heartbeat-persistence-while-keeping-permanent-connectivity-current.test-cases';
import { registerCheckpointsHeartbeatPersistenceWhileKeepingPermanentConnectivityCurrent } from './diagnostics.service.checkpoints-heartbeat-persistence-while-keeping-permanent-connectivity-current.test-cases';
import { registerPreservesLegacySequenceWatermarksAndMetadataChangesInsideTheCheckpointWindow } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';
import { registerPersistsStaleCanonicalSourceTimeAndKeepsItStaleAfterApiRestart } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';
import { registerPersistsACanonicalHeartbeatOnlyWithinTheSkewBoundIMs } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';
import { registerReportsMetadataOnlySavedDraftChangesWithoutReplacingAppliedChannelProjection } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';
import { registerKeepsTheAppliedMappingCurrentAfterARejectedPublication } from './diagnostics.service.checkpoints-heartbeat-persistence-while-keeping-permanent-connectivity-current.test-cases';
import { registerOnlyProjectsRejectionSummariesMatchingBothLatestRevisionAndHash } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';
import { registerDoesNotSynthesizeSamplesOrFaultsForPrototypeNamedChannelIds } from './diagnostics.service.checkpoints-heartbeat-persistence-while-keeping-permanent-connectivity-current.test-cases';
import { registerShowsHeartbeatOnlyLivenessWithoutInventingConnectedChannelState } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';
import { registerKeepsHardwareReadinessUnknownEvenWhenAppliedSurfacesFaultsAndMismatches } from './diagnostics.service.checkpoints-heartbeat-persistence-while-keeping-permanent-connectivity-current.test-cases';
import { registerGatesCanonicalChannelCurrentStatusOnConnectionSourceStateRevisionsAndFaults } from './diagnostics.service.checkpoints-heartbeat-persistence-while-keeping-permanent-connectivity-current.test-cases';
import { registerNeverCallsLegacySamplesCurrentEvenWithAnAppliedRevisionAndRecentHeartbeat } from './diagnostics.service.never-calls-legacy-samples-current-even-with-an-applied-revision-and-recent-heartbeat.test-cases';

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
  defineControllerDiagnosticsTests();
});

export function defineControllerDiagnosticsTests() {
  const scope = {
    get setup() {
      return setup;
    },
  };
  registerKeepsHealthyResourceControllersAvailableWhenAnotherAppliedSnapshotIsCorrupt(scope);
  registerCheckpointsHeartbeatPersistenceWhileKeepingPermanentConnectivityCurrent(scope);
  registerPreservesLegacySequenceWatermarksAndMetadataChangesInsideTheCheckpointWindow(scope);
  registerPersistsStaleCanonicalSourceTimeAndKeepsItStaleAfterApiRestart(scope);
  registerPersistsACanonicalHeartbeatOnlyWithinTheSkewBoundIMs(scope);
  function setup(missing = false, controllerOverrides = {}, draft: unknown = null) {
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
            ? { findOneBy: async () => draft }
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
  registerReportsMetadataOnlySavedDraftChangesWithoutReplacingAppliedChannelProjection(scope);

  registerKeepsTheAppliedMappingCurrentAfterARejectedPublication(scope);
  registerOnlyProjectsRejectionSummariesMatchingBothLatestRevisionAndHash(scope);
  registerDoesNotSynthesizeSamplesOrFaultsForPrototypeNamedChannelIds(scope);
  it('returns missing controller as not found', async () => {
    await expect(setup(true).service.get(1)).rejects.toThrow('WAGO controller not found');
  });
  registerShowsHeartbeatOnlyLivenessWithoutInventingConnectedChannelState(scope);

  registerKeepsHardwareReadinessUnknownEvenWhenAppliedSurfacesFaultsAndMismatches(scope);
  registerGatesCanonicalChannelCurrentStatusOnConnectionSourceStateRevisionsAndFaults(scope);
  registerNeverCallsLegacySamplesCurrentEvenWithAnAppliedRevisionAndRecentHeartbeat(scope);

  return scope;
}

export type ControllerDiagnosticsTestScope = ReturnType<typeof defineControllerDiagnosticsTests>;
