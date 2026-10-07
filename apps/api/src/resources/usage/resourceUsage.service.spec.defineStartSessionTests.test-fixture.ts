import { registerStartSessionShouldRollBackTheStartWhenAnHttpTransportFailureIsPropagated } from './resourceUsage.service.start-session-should-roll-back-the-start-when-an-http-transport-failure-is-propagated.test-cases';
import { registerStartSessionShouldThrowErrorWhenResourceDoesNotExist } from './resourceUsage.service.start-session-should-throw-error-when-resource-does-not-exist.test-cases';
import { registerStartSessionShouldThrowErrorWhenUserHasNotCompletedIntroduction } from './resourceUsage.service.start-session-should-throw-error-when-user-has-not-completed-introduction.test-cases';
import { registerStartSessionShouldThrowErrorWhenActiveSessionExistsAndNoTakeoverRequested } from './resourceUsage.service.start-session-should-throw-error-when-active-session-exists-and-no-takeover-requested.test-cases';
import { registerStartSessionShouldThrowErrorWhenTakeoverRequestedButResourceDoesNotAllowIt } from './resourceUsage.service.start-session-should-throw-error-when-takeover-requested-but-resource-does-not-allow-it.test-cases';
import { registerStartSessionShouldRollBackTheTakeoverWhenAnMqttControllerRejectionIsPropagated } from './resourceUsage.service.start-session-should-roll-back-the-takeover-when-an-mqtt-controller-rejection-is-propagated.test-cases';
import { registerStartSessionShouldTriggerOnlyTakeoverFlowOnTakeoverAndNotStartedStoppedBillingUnchanged } from './resourceUsage.service.start-session-should-trigger-only-takeover-flow-on-takeover-and-not-started-stopped-billing-unchanged.test-cases';
import { registerStartSessionShouldThrowResourceMaintenanceInUseExceptionWhenResourceIsUnderMaintenanceAndUserCanno } from './resourceUsage.service.start-session-should-throw-resource-maintenance-in-use-exception-when-resource-is-under-maintenance-and-user-canno.test-cases';
import { registerStartSessionShouldBlockNonMaintenanceUsersWhenActiveMaintenanceExistsIncludingScheduleTriggeredSame } from './resourceUsage.service.start-session-should-block-non-maintenance-users-when-active-maintenance-exists-including-schedule-triggered-same-.test-cases';
import { registerStartSessionShouldThrowResourceUnhealthyExceptionWhenResourceIsUnhealthyAndUserCannotManageMaintena } from './resourceUsage.service.start-session-should-throw-resource-unhealthy-exception-when-resource-is-unhealthy-and-user-cannot-manage-maintena.test-cases';
import { registerStartSessionShouldAllowMaintenanceUsersToStartASessionEvenWhenResourceIsUnhealthy } from './resourceUsage.service.start-session-should-allow-maintenance-users-to-start-a-session-even-when-resource-is-unhealthy.test-cases';
import { registerStartSessionShouldAllowUsageWhenResourceIsUnderMaintenanceButUserCanManageMaintenance } from './resourceUsage.service.start-session-should-allow-usage-when-resource-is-under-maintenance-but-user-can-manage-maintenance.test-cases';
import { registerStartSessionShouldRejectStartWhenBillingIsEnabledAndBalanceIsInsufficient } from './resourceUsage.service.start-session-should-reject-start-when-billing-is-enabled-and-balance-is-insufficient.test-cases';
import { registerStartSessionShouldStartWhenBillingIsEnabledAndBalanceIsSufficient } from './resourceUsage.service.start-session-should-start-when-billing-is-enabled-and-balance-is-sufficient.test-cases';
import { createStartSessionFixture } from './resourceUsage.service.spec.createStartSessionFixture.test-fixture';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineStartSessionTests(parentScope: ResourceUsageServiceTestScope) {
  const scope = createStartSessionFixture(parentScope);

  registerStartSessionShouldRollBackTheStartWhenAnHttpTransportFailureIsPropagated(scope);

  registerStartSessionShouldThrowErrorWhenResourceDoesNotExist(scope);

  registerStartSessionShouldThrowErrorWhenUserHasNotCompletedIntroduction(scope);

  registerStartSessionShouldThrowErrorWhenActiveSessionExistsAndNoTakeoverRequested(scope);

  registerStartSessionShouldThrowErrorWhenTakeoverRequestedButResourceDoesNotAllowIt(scope);

  registerStartSessionShouldRollBackTheTakeoverWhenAnMqttControllerRejectionIsPropagated(scope);

  registerStartSessionShouldTriggerOnlyTakeoverFlowOnTakeoverAndNotStartedStoppedBillingUnchanged(scope);

  registerStartSessionShouldThrowResourceMaintenanceInUseExceptionWhenResourceIsUnderMaintenanceAndUserCanno(scope);

  registerStartSessionShouldBlockNonMaintenanceUsersWhenActiveMaintenanceExistsIncludingScheduleTriggeredSame(scope);

  registerStartSessionShouldThrowResourceUnhealthyExceptionWhenResourceIsUnhealthyAndUserCannotManageMaintena(scope);

  registerStartSessionShouldAllowMaintenanceUsersToStartASessionEvenWhenResourceIsUnhealthy(scope);

  registerStartSessionShouldAllowUsageWhenResourceIsUnderMaintenanceButUserCanManageMaintenance(scope);

  registerStartSessionShouldRejectStartWhenBillingIsEnabledAndBalanceIsInsufficient(scope);

  registerStartSessionShouldStartWhenBillingIsEnabledAndBalanceIsSufficient(scope);

  return scope;
}
