import { registerHealthNodesScopeFixture } from './resource-flows-executor.service.health-nodes-06c314.test-fixture';
import { registerDoesNotTriggerHeartbeatUnhealthyWhenWithinTimeoutPart8Cases } from './resource-flows-executor.service.health-nodes.does-not-trigger-heartbeat-unhealthy-when-within-timeout.test-cases';
import { registerInitialisesLastSeenOnFirstHeartbeatTickWhenNotPreviouslyPart9Cases } from './resource-flows-executor.service.health-nodes.initialises-last-seen-on-first-heartbeat-tick-when-not-previously.test-cases';
import { registerReportsHealthyWhenHeartbeatOutputNodeFiresAndStoresLastCases } from './resource-flows-executor.service.health-nodes.reports-healthy-when-heartbeat-output-node-fires-and-stores-last.test-cases';
import { registerSetNodePayloadHealthIdentifierOverridesStaticIdentifierPart4Cases } from './resource-flows-executor.service.health-nodes.set-node-payload-health-identifier-overrides-static-identifier.test-cases';
import { registerSetNodePayloadHealthStatusOverridesStaticStatusAndSwitchPart3Cases } from './resource-flows-executor.service.health-nodes.set-node-payload-health-status-overrides-static-status-and-switch.test-cases';
import { registerSetNodeSetsHealthyFromStaticConfigAndClearsReasonPart2Cases } from './resource-flows-executor.service.health-nodes.set-node-sets-healthy-from-static-config-and-clears-reason.test-cases';
import { registerSetNodeSetsUnhealthyFromStaticConfigWithTemplatedReasonPart1Cases } from './resource-flows-executor.service.health-nodes.set-node-sets-unhealthy-from-static-config-with-templated-reason.test-cases';
import { registerSetNodeThrowsOnInvalidPayloadStatusPart6Cases } from './resource-flows-executor.service.health-nodes.set-node-throws-on-invalid-payload-status.test-cases';
import { registerSetNodeUsesStaticReasonWhenPayloadReasonAbsentPart5Cases } from './resource-flows-executor.service.health-nodes.set-node-uses-static-reason-when-payload-reason-absent.test-cases';
import { registerTriggersHeartbeatUnhealthyReportWhenTimeoutElapsedPart7Cases } from './resource-flows-executor.service.health-nodes.triggers-heartbeat-unhealthy-report-when-timeout-elapsed.test-cases';
import { registerUsesDefaultReasonWhenUnhealthyreasonIsBlankOnHeartbeatTiPart10Cases } from './resource-flows-executor.service.health-nodes.uses-default-reason-when-unhealthyreason-is-blank-on-heartbeat-ti.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerHealthNodesCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  describe('health nodes', () => {
    const scope = registerHealthNodesScopeFixture(fixture);
    registerReportsHealthyWhenHeartbeatOutputNodeFiresAndStoresLastCases(scope);
    registerSetNodeSetsUnhealthyFromStaticConfigWithTemplatedReasonPart1Cases(scope);
    registerSetNodeSetsHealthyFromStaticConfigAndClearsReasonPart2Cases(scope);
    registerSetNodePayloadHealthStatusOverridesStaticStatusAndSwitchPart3Cases(scope);
    registerSetNodePayloadHealthIdentifierOverridesStaticIdentifierPart4Cases(scope);
    registerSetNodeUsesStaticReasonWhenPayloadReasonAbsentPart5Cases(scope);
    registerSetNodeThrowsOnInvalidPayloadStatusPart6Cases(scope);
    registerTriggersHeartbeatUnhealthyReportWhenTimeoutElapsedPart7Cases(scope);
    registerDoesNotTriggerHeartbeatUnhealthyWhenWithinTimeoutPart8Cases(scope);
    registerInitialisesLastSeenOnFirstHeartbeatTickWhenNotPreviouslyPart9Cases(scope);
    registerUsesDefaultReasonWhenUnhealthyreasonIsBlankOnHeartbeatTiPart10Cases(scope);
  });
}
