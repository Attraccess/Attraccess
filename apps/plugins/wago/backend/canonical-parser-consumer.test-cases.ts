import type { WagoFlowServiceTestScope } from './wago-flow.service.spec';
import { WagoFlowService } from './wago-flow.service';
import { registerIngestsInputOnlyStateThroughTheRealParserAndDispatchesTypedInputEvents } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerInvalidatesOmittedInputsInANewerCompleteSnapshotJ } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerRejectsValuesFromMapsOrCategoriesUnsupportedByTheChannelCapability } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerKeepsInputAndMeasurementSamplesUnavailableAfterHardwareLossUntilNewSamplesArrive } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerPreservesSourceMetadataAndIndependentCategoryCountersAcrossInterleavingAndBootRestart } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerRequiresAStateSnapshotToEstablishAnUnseenBootBeforeAcceptingTelemetry } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerRejectsAnUnseenOldBootWithSourceAgeIWithoutGuessingResetsFromTheClock } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerInvalidatesSamplesWhenTheAppliedPhysicalMappingChangesAndRequiresItsReportedRevisionHas } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerFailsClosedAtTheRetiredStreamBoundInsteadOfForgettingReplayProtection } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerDoesNotRevivePreDisconnectMeasurementsDeliveredAfterRecovery } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerRequiresFreshConnectedStateEvidenceEvenWhenMeasurementSamplesAreFresh } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerInvalidatesAMeasurementFromStaleConnectionEvidenceWhenRecoveryHasTheSameSourceTimestamp } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerDropsQueuedEventsFromARetiredBootWhileKeepingTheDispatchQueueBounded } from './wago-flow.service.drops-queued-events-from-a-retired-boot-while-keeping-the-dispatch-queue-bounded.test-cases';
import { registerPreservesCanonicalMeasurementUnitsWithoutScalingTwiceJ } from './wago-flow.service.keeps-a-pending-wait-through-stale-and-replayed-matches-until-fresh-reconnect-state.test-cases';
import { registerRejectsMalformedOperationalMeasurementEnvelopesThroughTheParserJ } from './wago-flow.service.preserves-source-metadata-and-independent-category-counters-across-interleaving-and-boot-restart.test-cases';
import { registerComparesOwnerDefinedOpaqueStreamIdentitiesWithoutAssumingUuidSyntax } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';
import { registerConsumesTheCommittedEncoderOutputThroughTheParserWithoutRescalingJ } from './wago-flow.service.ages-a-previously-fresh-value-using-source-time-without-erasing-readable-state.test-cases';

export function defineCanonicalParserConsumerContractTests(parentScope: WagoFlowServiceTestScope) {
  const config = { controllerId: 1, channelId: 'sensor', category: 'state', equals: true, timeoutMs: 1_000 };
  const channels = [
    { id: 'sensor', capabilities: ['input'] },
    { id: 'relay', capabilities: ['output'] },
    { id: 'power', capabilities: ['measurement'] },
  ];
  async function setup() {
    const fixture = parentScope.createService();
    fixture.revisionQuery.getMany.mockResolvedValue([
      { ...parentScope.revision, snapshot: JSON.stringify({ logicalChannels: channels }) },
    ]);
    await fixture.service.refresh();
    return fixture;
  }
  const send = (
    service: WagoFlowService,
    suffix: string,
    sequence: number,
    body: Record<string, unknown>,
    streamId = parentScope.STREAM_A,
  ) =>
    service['onMessage'](
      2,
      'attraccess/wago',
      `attraccess/wago/v1/controllers/cc100-01/${suffix}`,
      Buffer.from(JSON.stringify({ timestamp: new Date().toISOString(), streamId, sequence, ...body })),
    );
  const snapshot = (
    service: WagoFlowService,
    sequence: number,
    body: Record<string, unknown> = {},
    streamId = parentScope.STREAM_A,
  ) =>
    send(
      service,
      'state',
      sequence,
      { connected: true, revision: 1, contentHash: 'hash', outputs: {}, inputs: {}, ...body },
      streamId,
    );
  const measurement = { channelId: 'power', unit: 'milliwatt', kind: 'live', value: 500 };
  const scope = {
    get setup() {
      return setup;
    },
    get config() {
      return config;
    },
    get snapshot() {
      return snapshot;
    },
    get STREAM_A() {
      return parentScope.STREAM_A;
    },
    get send() {
      return send;
    },
    get measurement() {
      return measurement;
    },
    get STREAM_B() {
      return parentScope.STREAM_B;
    },
    get revision() {
      return parentScope.revision;
    },
    get channels() {
      return channels;
    },
  };

  registerIngestsInputOnlyStateThroughTheRealParserAndDispatchesTypedInputEvents(scope);

  registerInvalidatesOmittedInputsInANewerCompleteSnapshotJ(scope);

  registerRejectsValuesFromMapsOrCategoriesUnsupportedByTheChannelCapability(scope);

  registerKeepsInputAndMeasurementSamplesUnavailableAfterHardwareLossUntilNewSamplesArrive(scope);

  registerPreservesSourceMetadataAndIndependentCategoryCountersAcrossInterleavingAndBootRestart(scope);

  registerRequiresAStateSnapshotToEstablishAnUnseenBootBeforeAcceptingTelemetry(scope);

  registerRejectsAnUnseenOldBootWithSourceAgeIWithoutGuessingResetsFromTheClock(scope);

  registerInvalidatesSamplesWhenTheAppliedPhysicalMappingChangesAndRequiresItsReportedRevisionHas(scope);

  registerFailsClosedAtTheRetiredStreamBoundInsteadOfForgettingReplayProtection(scope);

  registerDoesNotRevivePreDisconnectMeasurementsDeliveredAfterRecovery(scope);

  registerRequiresFreshConnectedStateEvidenceEvenWhenMeasurementSamplesAreFresh(scope);

  registerInvalidatesAMeasurementFromStaleConnectionEvidenceWhenRecoveryHasTheSameSourceTimestamp(scope);

  registerDropsQueuedEventsFromARetiredBootWhileKeepingTheDispatchQueueBounded(scope);

  registerPreservesCanonicalMeasurementUnitsWithoutScalingTwiceJ(scope);

  registerRejectsMalformedOperationalMeasurementEnvelopesThroughTheParserJ(scope);

  registerComparesOwnerDefinedOpaqueStreamIdentitiesWithoutAssumingUuidSyntax(scope);

  registerConsumesTheCommittedEncoderOutputThroughTheParserWithoutRescalingJ(scope);

  return scope;
}
