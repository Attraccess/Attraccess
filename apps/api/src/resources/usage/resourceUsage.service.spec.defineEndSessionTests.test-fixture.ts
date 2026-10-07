import { registerEndSessionShouldEndSessionSuccessfully } from './resourceUsage.service.end-session-should-end-session-successfully.test-cases';
import { registerEndSessionRunsTheStoppedSessionFlowAfterReservationButBeforeUsageFinalization } from './resourceUsage.service.end-session-runs-the-stopped-session-flow-after-reservation-but-before-usage-finalization.test-cases';
import { registerEndSessionLeavesTheSessionActiveWhenFailureIsPropagated } from './resourceUsage.service.end-session-leaves-the-session-active-when-failure-is-propagated.test-cases';
import { registerEndSessionReturnsTheNoActivityEndedSessionWithItsConfiguredEndNotesInUsageHistoryImmediately } from './resourceUsage.service.end-session-returns-the-no-activity-ended-session-with-its-configured-end-notes-in-usage-history-immediately.test-cases';
import { registerEndSessionRollsBackEndingTheSessionWhenBillingFails } from './resourceUsage.service.end-session-rolls-back-ending-the-session-when-billing-fails.test-cases';
import { registerEndSessionEmitsAResourceSessionEndedNotificationEventAfterEndingSomeoneElseSSession } from './resourceUsage.service.end-session-emits-a-resource-session-ended-notification-event-after-ending-someone-else-s-session.test-cases';
import { registerEndSessionEmitsASystemResourceSessionEndedNotificationEventForFlowEndedSessions } from './resourceUsage.service.end-session-emits-a-system-resource-session-ended-notification-event-for-flow-ended-sessions.test-cases';
import { registerEndSessionEmitsResourceUsageNoteAddedEventWhenAUserNoteIsPresent } from './resourceUsage.service.end-session-emits-resource-usage-note-added-event-when-a-user-note-is-present.test-cases';
import { registerEndSessionDoesNotEmitTheNoteEventWhenSkipNoteNotificationIsSetFlowEndedSession } from './resourceUsage.service.end-session-does-not-emit-the-note-event-when-skip-note-notification-is-set-flow-ended-session.test-cases';
import { registerEndSessionShouldThrowErrorWhenNoActiveSessionExists } from './resourceUsage.service.end-session-should-throw-error-when-no-active-session-exists.test-cases';
import { registerEndSessionLooksUpTheActiveSessionInsideTheStopTransaction } from './resourceUsage.service.end-session-looks-up-the-active-session-inside-the-stop-transaction.test-cases';
import { registerEndSessionAllowsUsersWithResourcesUpdatePermissionToEndSessionsOwnedByOthers } from './resourceUsage.service.end-session-allows-users-with-resources-update-permission-to-end-sessions-owned-by-others.test-cases';
import { registerEndSessionAllowsResourceIntroducersAndMaintainersToEndSessionsOwnedByOthers } from './resourceUsage.service.end-session-allows-resource-introducers-and-maintainers-to-end-sessions-owned-by-others.test-cases';
import { registerEndSessionAllowsGroupIntroducersToEndSessionsOwnedByOthers } from './resourceUsage.service.end-session-allows-group-introducers-to-end-sessions-owned-by-others.test-cases';
import { registerEndSessionAllowsTheSupervisorOfASupervisedSessionToEndItWithoutAnIntroducerRole } from './resourceUsage.service.end-session-allows-the-supervisor-of-a-supervised-session-to-end-it-without-an-introducer-role.test-cases';
import { registerEndSessionEmitsTheAutoPromotionCounterEventWhenASupervisedSessionEnds } from './resourceUsage.service.end-session-emits-the-auto-promotion-counter-event-when-a-supervised-session-ends.test-cases';
import { registerEndSessionDoesNotEmitTheAutoPromotionCounterEventForAnUnsupervisedSessionEnd } from './resourceUsage.service.end-session-does-not-emit-the-auto-promotion-counter-event-for-an-unsupervised-session-end.test-cases';
import { createEndSessionFixture } from './resourceUsage.service.spec.createEndSessionFixture.test-fixture';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineEndSessionTests(parentScope: ResourceUsageServiceTestScope) {
  const scope = createEndSessionFixture(parentScope);

  registerEndSessionShouldEndSessionSuccessfully(scope);

  registerEndSessionRunsTheStoppedSessionFlowAfterReservationButBeforeUsageFinalization(scope);

  registerEndSessionLeavesTheSessionActiveWhenFailureIsPropagated(scope);

  registerEndSessionReturnsTheNoActivityEndedSessionWithItsConfiguredEndNotesInUsageHistoryImmediately(scope);

  registerEndSessionRollsBackEndingTheSessionWhenBillingFails(scope);

  registerEndSessionEmitsAResourceSessionEndedNotificationEventAfterEndingSomeoneElseSSession(scope);

  registerEndSessionEmitsASystemResourceSessionEndedNotificationEventForFlowEndedSessions(scope);
  registerEndSessionEmitsResourceUsageNoteAddedEventWhenAUserNoteIsPresent(scope);

  registerEndSessionDoesNotEmitTheNoteEventWhenSkipNoteNotificationIsSetFlowEndedSession(scope);

  registerEndSessionShouldThrowErrorWhenNoActiveSessionExists(scope);

  registerEndSessionLooksUpTheActiveSessionInsideTheStopTransaction(scope);

  registerEndSessionAllowsUsersWithResourcesUpdatePermissionToEndSessionsOwnedByOthers(scope);

  registerEndSessionAllowsResourceIntroducersAndMaintainersToEndSessionsOwnedByOthers(scope);

  registerEndSessionAllowsGroupIntroducersToEndSessionsOwnedByOthers(scope);

  registerEndSessionAllowsTheSupervisorOfASupervisedSessionToEndItWithoutAnIntroducerRole(scope);

  registerEndSessionEmitsTheAutoPromotionCounterEventWhenASupervisedSessionEnds(scope);

  registerEndSessionDoesNotEmitTheAutoPromotionCounterEventForAnUnsupervisedSessionEnd(scope);

  return scope;
}
