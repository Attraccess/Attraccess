import { registerHandleStopResourceUsageSessionSendsTheFinalChargeWithConfiguredPrecisionAndTheActionRequestId } from './session.handler.handle-stop-resource-usage-session-sends-the-final-charge-with-configured-precision-and-the-action-request-id.test-cases';
import { registerHandleStopResourceUsageSessionOmitsTheSummaryForAnAbsentOrZeroChargeP } from './session.handler.handle-stop-resource-usage-session-omits-the-summary-for-an-absent-or-zero-charge-p.test-cases';
import { registerHandleStopResourceUsageSessionDoesNotExposeAnotherUserSChargeWhenAnAdministratorEndsTheirSession } from './session.handler.handle-stop-resource-usage-session-does-not-expose-another-user-s-charge-when-an-administrator-ends-their-session.test-cases';
import { registerHandleStopResourceUsageSessionKeepsTheActionSuccessfulIfTheReceiptLookupFailsAfterEndingTheSession } from './session.handler.handle-stop-resource-usage-session-keeps-the-action-successful-if-the-receipt-lookup-fails-after-ending-the-session.test-cases';
import { registerHandleStopResourceUsageSessionReturnsEarlyAndDoesNotEndASessionWhenTheGuardRejectsTheAction } from './session.handler.handle-stop-resource-usage-session-returns-early-and-does-not-end-a-session-when-the-guard-rejects-the-action.test-cases';
import { registerHandleStopResourceUsageSessionReturnsEarlyWhenFormsAreNotSatisfiedEnsureFormsSatisfiedReturnsNull } from './session.handler.handle-stop-resource-usage-session-returns-early-when-forms-are-not-satisfied-ensure-forms-satisfied-returns-null.test-cases';
import { registerHandleStopResourceUsageSessionSendsUserNotFoundWhenTheAuthenticatedUserDoesNotExist } from './session.handler.handle-stop-resource-usage-session-sends-user-not-found-when-the-authenticated-user-does-not-exist.test-cases';
import { registerHandleStopResourceUsageSessionEndsTheSessionClearsTheFormDraftAndSendsSuccess } from './session.handler.handle-stop-resource-usage-session-ends-the-session-clears-the-form-draft-and-sends-success.test-cases';
import { registerHandleStopResourceUsageSessionSendsTheErrorMessageAndLogsWhenEndingTheSessionFails } from './session.handler.handle-stop-resource-usage-session-sends-the-error-message-and-logs-when-ending-the-session-fails.test-cases';
import { createHandleStopResourceUsageSessionFixture } from './session.handler.spec.createHandleStopResourceUsageSessionFixture.test-fixture';
import { AttractapSessionHandlerSessionFlowButtonTestScope } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests';

export function defineHandleStopResourceUsageSessionTests(
  parentScope: AttractapSessionHandlerSessionFlowButtonTestScope,
) {
  const scope = createHandleStopResourceUsageSessionFixture(parentScope);
  registerHandleStopResourceUsageSessionSendsTheFinalChargeWithConfiguredPrecisionAndTheActionRequestId(scope);

  registerHandleStopResourceUsageSessionOmitsTheSummaryForAnAbsentOrZeroChargeP(scope);

  registerHandleStopResourceUsageSessionDoesNotExposeAnotherUserSChargeWhenAnAdministratorEndsTheirSession(scope);

  registerHandleStopResourceUsageSessionKeepsTheActionSuccessfulIfTheReceiptLookupFailsAfterEndingTheSession(scope);
  registerHandleStopResourceUsageSessionReturnsEarlyAndDoesNotEndASessionWhenTheGuardRejectsTheAction(scope);

  registerHandleStopResourceUsageSessionReturnsEarlyWhenFormsAreNotSatisfiedEnsureFormsSatisfiedReturnsNull(scope);

  registerHandleStopResourceUsageSessionSendsUserNotFoundWhenTheAuthenticatedUserDoesNotExist(scope);

  registerHandleStopResourceUsageSessionEndsTheSessionClearsTheFormDraftAndSendsSuccess(scope);

  registerHandleStopResourceUsageSessionSendsTheErrorMessageAndLogsWhenEndingTheSessionFails(scope);

  return scope;
}
