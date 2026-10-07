import { AuditAfterAll } from './audit-hooks.integration-afterall.test-utils';
import { AuditAfterEach } from './audit-hooks.integration-aftereach.test-utils';
import { AuditBeforeAll } from './audit-hooks.integration-beforeall.test-utils';
import { AuditBeforeEach } from './audit-hooks.integration-beforeeach.test-utils';
import { AuditFixtureState } from './audit-hooks.integration-fixture.test-utils';
import { privateValue, snapshot, verifier } from './audit-hooks.integration-globals.test-utils';
import { registerBoundsAStalledRotationDispatchAndRetainsEncryptedRecovery } from './audit-hooks.integration.bounds-a-stalled-rotation-dispatch-and-retains-encrypted-recovery.test-cases';
import { registerCompletesRotationOnlyOnTheCorrelatedReconnectRedactsRecoveryStatusAndPreservesAuditThro } from './audit-hooks.integration.completes-rotation-only-on-the-correlated-reconnect-redacts-recovery-status-and-preserves-audit-thro.test-cases';
import { registerPersistsAnAuthenticatedManualCommandWithItsRealDispatchedUuidAndSResult } from './audit-hooks.integration.persists-an-authenticated-manual-command-with-its-real-dispatched-uuid-and-s-result.test-cases';
import { registerPersistsFailedManualFallbackWithNoCredentialDispatchWhenThePhysicalVerifierIsWrong } from './audit-hooks.integration.persists-failed-manual-fallback-with-no-credential-dispatch-when-the-physical-verifier-is-wrong.test-cases';
import { registerPersistsInitiatingTokenIdentityThroughActualDeliveryAndDiscoveryAutomaticClaimThenSurviv } from './audit-hooks.integration.persists-initiating-token-identity-through-actual-delivery-and-discovery-automatic-claim-then-surviv.test-cases';
import { registerPersistsManualCredentialFallbackOnlyAfterMatchingAcknowledgementThroughTheAuthenticatedAp } from './audit-hooks.integration.persists-manual-credential-fallback-only-after-matching-acknowledgement-through-the-authenticated-ap.test-cases';
import { registerPersistsPublicationForcedPublicationRollbackAndIdempotentRejectionAcknowledgementRevisions } from './audit-hooks.integration.persists-publication-forced-publication-rollback-and-idempotent-rejection-acknowledgement-revisions.test-cases';
import { registerPreservesAcknowledgedCredentialsWhenTheLaterPublishReceiptFails } from './audit-hooks.integration.preserves-acknowledged-credentials-when-the-later-publish-receipt-fails.test-cases';
import { registerRecordsExactlyOneUnclaimAndRetainsSuccessAfterSessionCleanupFails } from './audit-hooks.integration.records-exactly-one-unclaim-and-retains-success-after-session-cleanup-fails.test-cases';
import { registerRecordsFailedUnclaimOnCredentialRevocationFailureWithoutDeletingTheController } from './audit-hooks.integration.records-failed-unclaim-on-credential-revocation-failure-without-deleting-the-controller.test-cases';
import { registerRejectsAManualHandoffToARuntimeWithoutExpirySupportBeforeDispatchOrAuditAdmission } from './audit-hooks.integration.rejects-a-manual-handoff-to-a-runtime-without-expiry-support-before-dispatch-or-audit-admission.test-cases';
import { registerRejectsRotationWithoutPermissionConfirmationAFreshOperationalHeartbeatOrAPinnedSessionB } from './audit-hooks.integration.rejects-rotation-without-permission-confirmation-a-fresh-operational-heartbeat-or-a-pinned-session-b.test-cases';
import { registerRejectsUnauthenticatedLifecycleRequestsBeforeCreatingAuditEvidence } from './audit-hooks.integration.rejects-unauthenticated-lifecycle-requests-before-creating-audit-evidence.test-cases';
import { registerReopensEncryptedPendingRotationAndRetriesTheSameHandoff } from './audit-hooks.integration.reopens-encrypted-pending-rotation-and-retries-the-same-handoff.test-cases';
import { registerRetainsFailedPublicationEvidenceAfterAllocationWithoutRecordingTransportErrors } from './audit-hooks.integration.retains-failed-publication-evidence-after-allocation-without-recording-transport-errors.test-cases';
import { registerRetainsSourceAndAllocatedRevisionOnRollbackDispatchFailureWithoutDuplicatePublicationEve } from './audit-hooks.integration.retains-source-and-allocated-revision-on-rollback-dispatch-failure-without-duplicate-publication-eve.test-cases';
import { registerRetainsTheReusedPendingRevisionOnRepeatedForcedPublicationDispatchFailure } from './audit-hooks.integration.retains-the-reused-pending-revision-on-repeated-forced-publication-dispatch-failure.test-cases';

describe('composed WAGO hooks through the host bridge and durable SQLite provider', () => {
  defineComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTests();
});

export function defineComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTests() {
  const state = new AuditFixtureState();
  beforeAll(() => AuditBeforeAll(state), 30_000);

  afterAll(() => AuditAfterAll(state));

  beforeEach(() => AuditBeforeEach(state));

  afterEach(() => AuditAfterEach(state));
  const scope = {
    get deliverAndClaim() {
      return state.deliverAndClaim;
    },
    get observeRotationProvider() {
      return state.observeRotationProvider;
    },
    get post() {
      return state.post;
    },
    get db() {
      return state.db;
    },
    set db(value: typeof state.db) {
      state.db = value;
    },
    get rotationReady() {
      return state.rotationReady;
    },
    get session() {
      return state.session;
    },
    set session(value: typeof state.session) {
      state.session = value;
    },
    get rows() {
      return state.rows;
    },
    get mqtt() {
      return state.mqtt;
    },
    set mqtt(value: typeof state.mqtt) {
      state.mqtt = value;
    },
    get rotationRecord() {
      return state.rotationRecord;
    },
    get privateValue() {
      return privateValue;
    },
    get context() {
      return state.context;
    },
    set context(value: typeof state.context) {
      state.context = value;
    },
    get lifecycle() {
      return state.lifecycle;
    },
    get app() {
      return state.app;
    },
    set app(value: typeof state.app) {
      state.app = value;
    },
    get revoke() {
      return state.revoke;
    },
    get remove() {
      return state.remove;
    },
    get wago() {
      return state.wago;
    },
    set wago(value: typeof state.wago) {
      state.wago = value;
    },
    get audit() {
      return state.audit;
    },
    set audit(value: typeof state.audit) {
      state.audit = value;
    },
    get commissioning() {
      return state.commissioning;
    },
    set commissioning(value: typeof state.commissioning) {
      state.commissioning = value;
    },
    get artifacts() {
      return state.artifacts;
    },
    set artifacts(value: typeof state.artifacts) {
      state.artifacts = value;
    },
    get mountApi() {
      return state.mountApi;
    },
    get verifier() {
      return verifier;
    },
    get saveAndPublish() {
      return state.saveAndPublish;
    },
    get snapshot() {
      return snapshot;
    },
    get manuallyEnrolledController() {
      return state.manuallyEnrolledController;
    },
  };

  registerRejectsRotationWithoutPermissionConfirmationAFreshOperationalHeartbeatOrAPinnedSessionB(scope);

  registerCompletesRotationOnlyOnTheCorrelatedReconnectRedactsRecoveryStatusAndPreservesAuditThro(scope);

  registerReopensEncryptedPendingRotationAndRetriesTheSameHandoff(scope);

  registerBoundsAStalledRotationDispatchAndRetainsEncryptedRecovery(scope);

  registerRejectsUnauthenticatedLifecycleRequestsBeforeCreatingAuditEvidence(scope);

  registerPersistsInitiatingTokenIdentityThroughActualDeliveryAndDiscoveryAutomaticClaimThenSurviv(scope);

  registerPersistsPublicationForcedPublicationRollbackAndIdempotentRejectionAcknowledgementRevisions(scope);

  registerRecordsExactlyOneUnclaimAndRetainsSuccessAfterSessionCleanupFails(scope);

  registerRecordsFailedUnclaimOnCredentialRevocationFailureWithoutDeletingTheController(scope);

  registerRetainsFailedPublicationEvidenceAfterAllocationWithoutRecordingTransportErrors(scope);

  registerRetainsSourceAndAllocatedRevisionOnRollbackDispatchFailureWithoutDuplicatePublicationEve(scope);

  registerRetainsTheReusedPendingRevisionOnRepeatedForcedPublicationDispatchFailure(scope);

  registerPersistsAnAuthenticatedManualCommandWithItsRealDispatchedUuidAndSResult(scope);
  registerPersistsManualCredentialFallbackOnlyAfterMatchingAcknowledgementThroughTheAuthenticatedAp(scope);

  registerPersistsFailedManualFallbackWithNoCredentialDispatchWhenThePhysicalVerifierIsWrong(scope);

  registerPreservesAcknowledgedCredentialsWhenTheLaterPublishReceiptFails(scope);

  registerRejectsAManualHandoffToARuntimeWithoutExpirySupportBeforeDispatchOrAuditAdmission(scope);

  return scope;
}

export type ComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTestScope = ReturnType<
  typeof defineComposedWagoHooksThroughTheHostBridgeAndDurableSqliteProviderTests
>;
