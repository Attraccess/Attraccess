import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';
import { WagoFlowService } from './wago-flow.service';
import { registerDoesNotCompleteFromASCachedMatch } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerCompletesImmediatelyFromAFreshRetainedMatch } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerKeepsFlowReadsAndWaitsAvailableWithIMsOfPositiveClockSkew } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerDoesNotLetFutureDatedSamplesBlockFreshUpdatesAfterClockCorrection } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerKeepsAPendingWaitThroughStaleAndReplayedMatchesUntilFreshReconnectState } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerDoesNotReviveCachedValuesWhenDisconnectAndReconnectOmitTheChannel } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerAgesAPreviouslyFreshValueUsingSourceTimeWithoutErasingReadableState } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerKeepsMeasurementWaitsUnavailableAcrossInterleavedOfflineTelemetryUntilANewConnectedSampl } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerBoundsCacheAndQueuedDispatchesWhileStillResolvingWaitsUnderBackpressure } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';

export function defineWaitFreshnessTests(parentScope: WagoFlowServiceTestScope) {
  const config = { controllerId: 1, channelId: 'door', category: 'state', equals: true, timeoutMs: 1_000 };
  const stateMessage = (
    service: WagoFlowService,
    sequence: number,
    options: { age?: number; connected?: boolean; outputs?: Record<string, boolean>; streamId?: string } = {},
  ) =>
    service['onMessage'](
      2,
      'attraccess/wago',
      'attraccess/wago/v1/controllers/cc100-01/state',
      Buffer.from(
        JSON.stringify({
          streamId: options.streamId ?? parentScope.STREAM_A,
          sequence,
          timestamp: new Date(Date.now() - (options.age ?? 0)).toISOString(),
          connected: options.connected ?? true,
          revision: 1,
          contentHash: 'hash',
          outputs: options.outputs ?? { door: true },
        }),
      ),
    );
  const scope = {
    get createService() {
      return parentScope.createService;
    },
    get stateMessage() {
      return stateMessage;
    },
    get config() {
      return config;
    },
    get STREAM_B() {
      return parentScope.STREAM_B;
    },
    get revision() {
      return parentScope.revision;
    },
    get STREAM_A() {
      return parentScope.STREAM_A;
    },
  };

  registerDoesNotCompleteFromASCachedMatch(scope);

  registerCompletesImmediatelyFromAFreshRetainedMatch(scope);

  registerKeepsFlowReadsAndWaitsAvailableWithIMsOfPositiveClockSkew(scope);

  registerDoesNotLetFutureDatedSamplesBlockFreshUpdatesAfterClockCorrection(scope);

  registerKeepsAPendingWaitThroughStaleAndReplayedMatchesUntilFreshReconnectState(scope);

  registerDoesNotReviveCachedValuesWhenDisconnectAndReconnectOmitTheChannel(scope);

  registerAgesAPreviouslyFreshValueUsingSourceTimeWithoutErasingReadableState(scope);

  registerKeepsMeasurementWaitsUnavailableAcrossInterleavedOfflineTelemetryUntilANewConnectedSampl(scope);

  registerBoundsCacheAndQueuedDispatchesWhileStillResolvingWaitsUnderBackpressure(scope);

  return scope;
}
