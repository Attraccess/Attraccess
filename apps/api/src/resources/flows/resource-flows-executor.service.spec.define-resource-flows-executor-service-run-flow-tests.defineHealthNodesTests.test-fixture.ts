import { registerHealthNodesReportsHealthyWhenHeartbeatOutputNodeFiresAndStoresLastSeenTimestamp } from './resource-flows-executor.service.health-nodes-reports-healthy-when-heartbeat-output-node-fires-and-stores-last-seen-timestamp.test-cases';
import { registerHealthNodesSetNodeSetsUnhealthyFromStaticConfigWithTemplatedReason } from './resource-flows-executor.service.health-nodes-set-node-sets-unhealthy-from-static-config-with-templated-reason.test-cases';
import { registerHealthNodesSetNodeSetsHealthyFromStaticConfigAndClearsReason } from './resource-flows-executor.service.health-nodes-set-node-sets-healthy-from-static-config-and-clears-reason.test-cases';
import { registerHealthNodesSetNodePayloadHealthStatusOverridesStaticStatusAndSwitchesSourceToPayload } from './resource-flows-executor.service.health-nodes-set-node-payload-health-status-overrides-static-status-and-switches-source-to-payload.test-cases';
import { registerHealthNodesSetNodePayloadHealthIdentifierOverridesStaticIdentifier } from './resource-flows-executor.service.health-nodes-set-node-payload-health-identifier-overrides-static-identifier.test-cases';
import { registerHealthNodesSetNodeUsesStaticReasonWhenPayloadReasonAbsent } from './resource-flows-executor.service.health-nodes-set-node-uses-static-reason-when-payload-reason-absent.test-cases';
import { registerHealthNodesSetNodeThrowsOnInvalidPayloadStatus } from './resource-flows-executor.service.health-nodes-set-node-throws-on-invalid-payload-status.test-cases';
import { registerHealthNodesTriggersHeartbeatUnhealthyReportWhenTimeoutElapsed } from './resource-flows-executor.service.health-nodes-triggers-heartbeat-unhealthy-report-when-timeout-elapsed.test-cases';
import { registerHealthNodesDoesNotTriggerHeartbeatUnhealthyWhenWithinTimeout } from './resource-flows-executor.service.health-nodes-does-not-trigger-heartbeat-unhealthy-when-within-timeout.test-cases';
import { registerHealthNodesInitialisesLastSeenOnFirstHeartbeatTickWhenNotPreviouslySet } from './resource-flows-executor.service.health-nodes-initialises-last-seen-on-first-heartbeat-tick-when-not-previously-set.test-cases';
import { registerHealthNodesUsesDefaultReasonWhenUnhealthyReasonIsBlankOnHeartbeatTimeout } from './resource-flows-executor.service.health-nodes-uses-default-reason-when-unhealthy-reason-is-blank-on-heartbeat-timeout.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests';

export function defineHealthNodesTests(parentScope: ResourceFlowsExecutorServiceRunFlowTestScope) {
  const scope = inheritTestScope(
    {
      get createNode() {
        return parentScope.createNode;
      },
      get nodesById() {
        return parentScope.nodesById;
      },
      set nodesById(value: typeof parentScope.nodesById) {
        parentScope.nodesById = value;
      },
      get initialNodes() {
        return parentScope.initialNodes;
      },
      set initialNodes(value: typeof parentScope.initialNodes) {
        parentScope.initialNodes = value;
      },
      get edgesBySourceAndHandle() {
        return parentScope.edgesBySourceAndHandle;
      },
      set edgesBySourceAndHandle(value: typeof parentScope.edgesBySourceAndHandle) {
        parentScope.edgesBySourceAndHandle = value;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get resourceHealthService() {
        return parentScope.resourceHealthService;
      },
      set resourceHealthService(value: typeof parentScope.resourceHealthService) {
        parentScope.resourceHealthService = value;
      },
      get flowNodeRepository() {
        return parentScope.flowNodeRepository;
      },
      set flowNodeRepository(value: typeof parentScope.flowNodeRepository) {
        parentScope.flowNodeRepository = value;
      },
    },
    parentScope,
  );
  registerHealthNodesReportsHealthyWhenHeartbeatOutputNodeFiresAndStoresLastSeenTimestamp(scope);

  registerHealthNodesSetNodeSetsUnhealthyFromStaticConfigWithTemplatedReason(scope);

  registerHealthNodesSetNodeSetsHealthyFromStaticConfigAndClearsReason(scope);

  registerHealthNodesSetNodePayloadHealthStatusOverridesStaticStatusAndSwitchesSourceToPayload(scope);

  registerHealthNodesSetNodePayloadHealthIdentifierOverridesStaticIdentifier(scope);

  registerHealthNodesSetNodeUsesStaticReasonWhenPayloadReasonAbsent(scope);

  registerHealthNodesSetNodeThrowsOnInvalidPayloadStatus(scope);

  registerHealthNodesTriggersHeartbeatUnhealthyReportWhenTimeoutElapsed(scope);

  registerHealthNodesDoesNotTriggerHeartbeatUnhealthyWhenWithinTimeout(scope);

  registerHealthNodesInitialisesLastSeenOnFirstHeartbeatTickWhenNotPreviouslySet(scope);

  registerHealthNodesUsesDefaultReasonWhenUnhealthyReasonIsBlankOnHeartbeatTimeout(scope);

  return scope;
}
