import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { Repository } from 'typeorm';
import { Resource, ResourceFlowNode } from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceHealthService } from '../health/resource-health.service';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { registerResourceFlowsExecutorServiceRunFlowSubscribesValidMqttTriggersAndWaitsPreservingQoSAndToleratingAFailedSubscription } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-subscribes-valid-mqtt-triggers-and-waits-preserving-qo-s-and-tolerating-a-failed-subscription.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowMatchesCompanionUsbSFiltersBeforeStartingFlows } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-matches-companion-usb-s-filters-before-starting-flows.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowAllowsFlowButtonsOnlyForTheActiveSessionOwnerAndRejectsMissingButtons } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-allows-flow-buttons-only-for-the-active-session-owner-and-rejects-missing-buttons.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRecordsUsefulDescriptionsForPluginErrors } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-records-useful-descriptions-for-plugin-errors.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowPreservesAnExternalEffectFailureWhenAnotherBranchRejectsFirst } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-preserves-an-external-effect-failure-when-another-branch-rejects-first.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRecordsTheSameExecutionIdentityOnOperatingTransitionsAndFlowLogs } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-records-the-same-execution-identity-on-operating-transitions-and-flow-logs.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRoutesAMeteringStartAndCollectionBranchToTheReplyChannelOfItsOperation } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-routes-a-metering-start-and-collection-branch-to-the-reply-channel-of-its-operation.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowCarriesLifecycleStagingIdentityThroughDownstreamFlowNodes } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-carries-lifecycle-staging-identity-through-downstream-flow-nodes.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowReturnsEmptyArrayWhenNoTriggerNodesAreFound } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-returns-empty-array-when-no-trigger-nodes-are-found.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowStartsEveryMatchingPluginTriggerWhileIsolatingMatcherFailures } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-starts-every-matching-plugin-trigger-while-isolating-matcher-failures.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowPagesPluginTriggerNodesAndLimitsConcurrentFlowRuns } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-pages-plugin-trigger-nodes-and-limits-concurrent-flow-runs.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowEvaluatesConcurrentPluginTriggersInOrderWithoutWaitingForEarlierFlowRuns } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-evaluates-concurrent-plugin-triggers-in-order-without-waiting-for-earlier-flow-runs.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRejectsAPluginAttemptingToTriggerANodeOwnedByAnotherPlugin } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-rejects-a-plugin-attempting-to-trigger-a-node-owned-by-another-plugin.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRejectsAPluginTriggerTypeThatCollidesWithABuiltInFlowNode } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-rejects-a-plugin-trigger-type-that-collides-with-a-built-in-flow-node.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowContinuesStartingMatchingPluginFlowsAfterAFlowFails } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-continues-starting-matching-plugin-flows-after-a-flow-fails.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowReturnsInitialDataWhenASingleInputNodeHasNoOutgoingEdgesTerminal } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-returns-initial-data-when-a-single-input-node-has-no-outgoing-edges-terminal.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowHandlesASimpleLinearPathAndReturnsTheLastNodePayload } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-handles-a-simple-linear-path-and-returns-the-last-node-payload.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowUsesResourceMetadataInTemplatedMqttTopics } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-uses-resource-metadata-in-templated-mqtt-topics.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowEvaluatesIfNodesUsingResourceMetadataInPayload } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-evaluates-if-nodes-using-resource-metadata-in-payload.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowFanOutsWhenANodeHasMultipleOutgoingEdgesWithTheSameHandleAndReturnsAllLeafResults } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-fan-outs-when-a-node-has-multiple-outgoing-edges-with-the-same-handle-and-returns-all-leaf-results.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRoutesAnExternalEffectFailureThroughItsFailureOutput } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-routes-an-external-effect-failure-through-its-failure-output.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowRoutesALoggedExternalEffectFailureThroughItsNormalOutput } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-routes-a-logged-external-effect-failure-through-its-normal-output.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowPreservesTheLegacyFlowFailureBehaviorWhenNoPolicyWasSaved } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-preserves-the-legacy-flow-failure-behavior-when-no-policy-was-saved.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowWaitsForStartedSiblingSBeforeRejectingAFlow } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-waits-for-started-sibling-s-before-rejecting-a-flow.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowPreservesNoPolicyExternalEffectFailuresForTheSLifecycleFlow } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-preserves-no-policy-external-effect-failures-for-the-s-lifecycle-flow.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowPropagatesAnExternalEffectFailureWhenConfiguredToFailTheFlow } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-propagates-an-external-effect-failure-when-configured-to-fail-the-flow.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowEndsTheActiveUsageSessionWithTemplatedNotesAndPassesPayloadThrough } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-ends-the-active-usage-session-with-templated-notes-and-passes-payload-through.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowPropagatesExplicitTerminationFailuresFromTheSLifecycleFlow } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-propagates-explicit-termination-failures-from-the-s-lifecycle-flow.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowUpdatesResourceActivityWhenTrackActivityNodeExecutesAndPassesPayloadThrough } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-updates-resource-activity-when-track-activity-node-executes-and-passes-payload-through.test-cases';
import { registerResourceFlowsExecutorServiceRunFlowTriggersInactivityFlowWhenResourceExceedsConfiguredInactivityMinutes } from './resource-flows-executor.service.resource-flows-executor-service-run-flow-triggers-inactivity-flow-when-resource-exceeds-configured-inactivity-minutes.test-cases';
import { resetTestFixture } from './resource-flows-executor.service.setup.test-fixture';
import { Edge } from './resource-flows-executor.service.spec.edge';
import { createNode } from './resource-flows-executor.service.spec.create-node';
import { defineHealthNodesTests } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests.defineHealthNodesTests.test-fixture';
import { defineVariableNodesTests } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests.defineVariableNodesTests.test-fixture';
import { defineArithmeticTemplatesTests } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests.defineArithmeticTemplatesTests.test-fixture';

export function defineResourceFlowsExecutorServiceRunFlowTests() {
  let errorShapeIndex = 0;
  let service: ResourceFlowsExecutorService;

  // Repositories and dependencies
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  let flowEdgeRepository: Partial<Repository<Edge>>;
  let flowLogs: FlowLogRecorderService;
  let resourceRepository: Partial<Repository<Resource>>;
  let mqttClientService: MqttClientService;
  let resourceUsageService: ResourceUsageService;
  let eventEmitter: EventEmitter2;
  let resourceHealthService: ResourceHealthService;
  let variablesService: ResourceFlowVariablesService;
  let operatingIntervals: { transition: jest.Mock };

  // Dynamic stores per test
  let nodesById: Record<string, ResourceFlowNode>;
  let initialNodes: ResourceFlowNode[];
  const scope = {
    get initialNodes() {
      return initialNodes;
    },
    set initialNodes(value: typeof initialNodes) {
      initialNodes = value;
    },
    get createNode() {
      return createNode;
    },
    get mqttClientService() {
      return mqttClientService;
    },
    set mqttClientService(value: typeof mqttClientService) {
      mqttClientService = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    set resourceUsageService(value: typeof resourceUsageService) {
      resourceUsageService = value;
    },
    get nodesById() {
      return nodesById;
    },
    set nodesById(value: typeof nodesById) {
      nodesById = value;
    },
    get errorShapeIndex() {
      return errorShapeIndex;
    },
    set errorShapeIndex(value: typeof errorShapeIndex) {
      errorShapeIndex = value;
    },
    get edgesBySourceAndHandle() {
      return edgesBySourceAndHandle;
    },
    set edgesBySourceAndHandle(value: typeof edgesBySourceAndHandle) {
      edgesBySourceAndHandle = value;
    },
    get flowLogs() {
      return flowLogs;
    },
    set flowLogs(value: typeof flowLogs) {
      flowLogs = value;
    },
    get operatingIntervals() {
      return operatingIntervals;
    },
    set operatingIntervals(value: typeof operatingIntervals) {
      operatingIntervals = value;
    },
    get flowNodeRepository() {
      return flowNodeRepository;
    },
    set flowNodeRepository(value: typeof flowNodeRepository) {
      flowNodeRepository = value;
    },
    get flowEdgeRepository() {
      return flowEdgeRepository;
    },
    set flowEdgeRepository(value: typeof flowEdgeRepository) {
      flowEdgeRepository = value;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    set resourceRepository(value: typeof resourceRepository) {
      resourceRepository = value;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    set eventEmitter(value: typeof eventEmitter) {
      eventEmitter = value;
    },
    get resourceHealthService() {
      return resourceHealthService;
    },
    set resourceHealthService(value: typeof resourceHealthService) {
      resourceHealthService = value;
    },
    get variablesService() {
      return variablesService;
    },
    set variablesService(value: typeof variablesService) {
      variablesService = value;
    },
  };
  let edgesBySourceAndHandle: Record<string, Edge[]>; // key: `${source}|${handle ?? ''}`

  beforeEach(() => {
    resetTestFixture(scope);
  });

  registerResourceFlowsExecutorServiceRunFlowSubscribesValidMqttTriggersAndWaitsPreservingQoSAndToleratingAFailedSubscription(
    scope,
  );

  registerResourceFlowsExecutorServiceRunFlowMatchesCompanionUsbSFiltersBeforeStartingFlows(scope);

  registerResourceFlowsExecutorServiceRunFlowAllowsFlowButtonsOnlyForTheActiveSessionOwnerAndRejectsMissingButtons(
    scope,
  );

  registerResourceFlowsExecutorServiceRunFlowRecordsUsefulDescriptionsForPluginErrors(scope);

  registerResourceFlowsExecutorServiceRunFlowPreservesAnExternalEffectFailureWhenAnotherBranchRejectsFirst(scope);

  registerResourceFlowsExecutorServiceRunFlowRecordsTheSameExecutionIdentityOnOperatingTransitionsAndFlowLogs(scope);

  registerResourceFlowsExecutorServiceRunFlowRoutesAMeteringStartAndCollectionBranchToTheReplyChannelOfItsOperation(
    scope,
  );

  registerResourceFlowsExecutorServiceRunFlowCarriesLifecycleStagingIdentityThroughDownstreamFlowNodes(scope);

  registerResourceFlowsExecutorServiceRunFlowReturnsEmptyArrayWhenNoTriggerNodesAreFound(scope);

  registerResourceFlowsExecutorServiceRunFlowStartsEveryMatchingPluginTriggerWhileIsolatingMatcherFailures(scope);

  registerResourceFlowsExecutorServiceRunFlowPagesPluginTriggerNodesAndLimitsConcurrentFlowRuns(scope);

  registerResourceFlowsExecutorServiceRunFlowEvaluatesConcurrentPluginTriggersInOrderWithoutWaitingForEarlierFlowRuns(
    scope,
  );

  registerResourceFlowsExecutorServiceRunFlowRejectsAPluginAttemptingToTriggerANodeOwnedByAnotherPlugin(scope);

  registerResourceFlowsExecutorServiceRunFlowRejectsAPluginTriggerTypeThatCollidesWithABuiltInFlowNode(scope);

  registerResourceFlowsExecutorServiceRunFlowContinuesStartingMatchingPluginFlowsAfterAFlowFails(scope);

  registerResourceFlowsExecutorServiceRunFlowReturnsInitialDataWhenASingleInputNodeHasNoOutgoingEdgesTerminal(scope);

  registerResourceFlowsExecutorServiceRunFlowHandlesASimpleLinearPathAndReturnsTheLastNodePayload(scope);

  registerResourceFlowsExecutorServiceRunFlowUsesResourceMetadataInTemplatedMqttTopics(scope);

  registerResourceFlowsExecutorServiceRunFlowEvaluatesIfNodesUsingResourceMetadataInPayload(scope);

  registerResourceFlowsExecutorServiceRunFlowFanOutsWhenANodeHasMultipleOutgoingEdgesWithTheSameHandleAndReturnsAllLeafResults(
    scope,
  );

  registerResourceFlowsExecutorServiceRunFlowRoutesAnExternalEffectFailureThroughItsFailureOutput(scope);

  registerResourceFlowsExecutorServiceRunFlowRoutesALoggedExternalEffectFailureThroughItsNormalOutput(scope);

  registerResourceFlowsExecutorServiceRunFlowPreservesTheLegacyFlowFailureBehaviorWhenNoPolicyWasSaved(scope);

  registerResourceFlowsExecutorServiceRunFlowWaitsForStartedSiblingSBeforeRejectingAFlow(scope);

  registerResourceFlowsExecutorServiceRunFlowPreservesNoPolicyExternalEffectFailuresForTheSLifecycleFlow(scope);

  registerResourceFlowsExecutorServiceRunFlowPropagatesAnExternalEffectFailureWhenConfiguredToFailTheFlow(scope);

  registerResourceFlowsExecutorServiceRunFlowEndsTheActiveUsageSessionWithTemplatedNotesAndPassesPayloadThrough(scope);

  registerResourceFlowsExecutorServiceRunFlowPropagatesExplicitTerminationFailuresFromTheSLifecycleFlow(scope);

  registerResourceFlowsExecutorServiceRunFlowUpdatesResourceActivityWhenTrackActivityNodeExecutesAndPassesPayloadThrough(
    scope,
  );

  registerResourceFlowsExecutorServiceRunFlowTriggersInactivityFlowWhenResourceExceedsConfiguredInactivityMinutes(
    scope,
  );

  describe('health nodes', () => {
    defineHealthNodesTests(scope);
  });

  describe('arithmetic templates', () => {
    defineArithmeticTemplatesTests(scope);
  });

  describe('variable nodes', () => {
    defineVariableNodesTests(scope);
  });

  return scope;
}
