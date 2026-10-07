import { registerHandleStartResourceUsageSessionReturnsEarlyAndDoesNotStartASessionWhenTheGuardRejectsTheAction } from './session.handler.handle-start-resource-usage-session-returns-early-and-does-not-start-a-session-when-the-guard-rejects-the-action.test-cases';
import { registerHandleStartResourceUsageSessionReturnsEarlyWhenFormsAreNotSatisfiedEnsureFormsSatisfiedReturnsNull } from './session.handler.handle-start-resource-usage-session-returns-early-when-forms-are-not-satisfied-ensure-forms-satisfied-returns-null.test-cases';
import { registerHandleStartResourceUsageSessionSendsUserNotFoundWhenTheAuthenticatedUserDoesNotExist } from './session.handler.handle-start-resource-usage-session-sends-user-not-found-when-the-authenticated-user-does-not-exist.test-cases';
import { registerHandleStartResourceUsageSessionStartsTheSessionClearsTheFormDraftAndSendsSuccess } from './session.handler.handle-start-resource-usage-session-starts-the-session-clears-the-form-draft-and-sends-success.test-cases';
import { registerHandleStartResourceUsageSessionAttachesTheSupervisorAndSettlesTheWebRequestForATwoCardSupervisedStart } from './session.handler.handle-start-resource-usage-session-attaches-the-supervisor-and-settles-the-web-request-for-a-two-card-supervised-start.test-cases';
import { registerHandleStartResourceUsageSessionEchoesTheOriginatingRequestIdOnSuccessAndError } from './session.handler.handle-start-resource-usage-session-echoes-the-originating-request-id-on-success-and-error.test-cases';
import { registerHandleStartResourceUsageSessionSendsInsufficientBalanceWithSumUpEnabledForInsufficientBalanceError } from './session.handler.handle-start-resource-usage-session-sends-insufficient-balance-with-sum-up-enabled-for-insufficient-balance-error.test-cases';
import { registerHandleStartResourceUsageSessionSendsInsufficientBalanceForAPlainErrorWhoseMessageIsInsufficientBalance } from './session.handler.handle-start-resource-usage-session-sends-insufficient-balance-for-a-plain-error-whose-message-is-insufficient-balance.test-cases';
import { registerHandleStartResourceUsageSessionSendsTheRawErrorMessageAndLogsForAnyOtherError } from './session.handler.handle-start-resource-usage-session-sends-the-raw-error-message-and-logs-for-any-other-error.test-cases';
import { createHandleStartResourceUsageSessionFixture } from './session.handler.spec.createHandleStartResourceUsageSessionFixture.test-fixture';
import { AttractapSessionHandlerSessionFlowButtonTestScope } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests';
import { defineResourceInUseErrorHandlingTests } from './session.handler.spec.define-attractap-session-handler-session-flow-button-tests.defineResourceInUseErrorHandlingTests.test-fixture';

export function defineHandleStartResourceUsageSessionTests(
  parentScope: AttractapSessionHandlerSessionFlowButtonTestScope,
) {
  const scope = createHandleStartResourceUsageSessionFixture(parentScope);

  registerHandleStartResourceUsageSessionReturnsEarlyAndDoesNotStartASessionWhenTheGuardRejectsTheAction(scope);

  registerHandleStartResourceUsageSessionReturnsEarlyWhenFormsAreNotSatisfiedEnsureFormsSatisfiedReturnsNull(scope);

  registerHandleStartResourceUsageSessionSendsUserNotFoundWhenTheAuthenticatedUserDoesNotExist(scope);

  registerHandleStartResourceUsageSessionStartsTheSessionClearsTheFormDraftAndSendsSuccess(scope);

  registerHandleStartResourceUsageSessionAttachesTheSupervisorAndSettlesTheWebRequestForATwoCardSupervisedStart(scope);

  registerHandleStartResourceUsageSessionEchoesTheOriginatingRequestIdOnSuccessAndError(scope);

  describe('ResourceInUseError handling', () => {
    defineResourceInUseErrorHandlingTests(scope);
  });

  registerHandleStartResourceUsageSessionSendsInsufficientBalanceWithSumUpEnabledForInsufficientBalanceError(scope);

  registerHandleStartResourceUsageSessionSendsInsufficientBalanceForAPlainErrorWhoseMessageIsInsufficientBalance(scope);

  registerHandleStartResourceUsageSessionSendsTheRawErrorMessageAndLogsForAnyOtherError(scope);

  return scope;
}
