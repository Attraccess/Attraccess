import { registerArithmeticTemplatesConvertsUnitsInSetPayloadUsingStoredVariablesAndPublishesTheConvertedFields } from './resource-flows-executor.service.arithmetic-templates-converts-units-in-set-payload-using-stored-variables-and-publishes-the-converted-fields.test-cases';
import { registerArithmeticTemplatesStoresTheResultOfAnArithmeticTemplateAsANumericVariable } from './resource-flows-executor.service.arithmetic-templates-stores-the-result-of-an-arithmetic-template-as-a-numeric-variable.test-cases';
import { registerArithmeticTemplatesStopsANodeWithInvalidArithmeticInputP } from './resource-flows-executor.service.arithmetic-templates-stops-a-node-with-invalid-arithmetic-input-p.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests';

export function defineArithmeticTemplatesTests(parentScope: ResourceFlowsExecutorServiceRunFlowTestScope) {
  const scope = inheritTestScope(
    {
      get variablesService() {
        return parentScope.variablesService;
      },
      set variablesService(value: typeof parentScope.variablesService) {
        parentScope.variablesService = value;
      },
      get createNode() {
        return parentScope.createNode;
      },
      get initialNodes() {
        return parentScope.initialNodes;
      },
      set initialNodes(value: typeof parentScope.initialNodes) {
        parentScope.initialNodes = value;
      },
      get nodesById() {
        return parentScope.nodesById;
      },
      set nodesById(value: typeof parentScope.nodesById) {
        parentScope.nodesById = value;
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
      get mqttClientService() {
        return parentScope.mqttClientService;
      },
      set mqttClientService(value: typeof parentScope.mqttClientService) {
        parentScope.mqttClientService = value;
      },
    },
    parentScope,
  );
  registerArithmeticTemplatesConvertsUnitsInSetPayloadUsingStoredVariablesAndPublishesTheConvertedFields(scope);

  registerArithmeticTemplatesStoresTheResultOfAnArithmeticTemplateAsANumericVariable(scope);

  registerArithmeticTemplatesStopsANodeWithInvalidArithmeticInputP(scope);

  return scope;
}
