import { registerVariableNodesProcessingSetVariablesRendersTemplatesAndStoresJsonParsedValues } from './resource-flows-executor.service.variable-nodes-processing-set-variables-renders-templates-and-stores-json-parsed-values.test-cases';
import { registerVariableNodesSerializesAnObjectPayloadForADownstreamMqttMessageUsingJsonPayload } from './resource-flows-executor.service.variable-nodes-serializes-an-object-payload-for-a-downstream-mqtt-message-using-json-payload.test-cases';
import { registerVariableNodesProcessingGetVariablesWritesLodashSetIntoPayload } from './resource-flows-executor.service.variable-nodes-processing-get-variables-writes-lodash-set-into-payload.test-cases';
import { registerVariableNodesExposesVariablesToHandlebarsContextViaVariablesResourceAndVariablesGlobal } from './resource-flows-executor.service.variable-nodes-exposes-variables-to-handlebars-context-via-variables-resource-and-variables-global.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests';

export function defineVariableNodesTests(parentScope: ResourceFlowsExecutorServiceRunFlowTestScope) {
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
      get variablesService() {
        return parentScope.variablesService;
      },
      set variablesService(value: typeof parentScope.variablesService) {
        parentScope.variablesService = value;
      },
      get mqttClientService() {
        return parentScope.mqttClientService;
      },
      set mqttClientService(value: typeof parentScope.mqttClientService) {
        parentScope.mqttClientService = value;
      },
    },
    parentScope,
  );
  registerVariableNodesProcessingSetVariablesRendersTemplatesAndStoresJsonParsedValues(scope);

  registerVariableNodesSerializesAnObjectPayloadForADownstreamMqttMessageUsingJsonPayload(scope);

  registerVariableNodesProcessingGetVariablesWritesLodashSetIntoPayload(scope);

  registerVariableNodesExposesVariablesToHandlebarsContextViaVariablesResourceAndVariablesGlobal(scope);

  return scope;
}
