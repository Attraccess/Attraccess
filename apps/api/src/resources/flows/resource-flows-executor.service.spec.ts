import { defineResourceFlowsExecutorServiceRunFlowTests } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests';
import { defineResourceFlowsExecutorServiceMqttTests } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-mqtt-tests';
jest.mock('axios');

// Minimal edge shape for our mocks
// Helper to create a node
describe('ResourceFlowsExecutorService.runFlow', () => {
  defineResourceFlowsExecutorServiceRunFlowTests();
});

describe('ResourceFlowsExecutorService MQTT', () => {
  defineResourceFlowsExecutorServiceMqttTests();
});
export {
  defineResourceFlowsExecutorServiceRunFlowTests,
  ResourceFlowsExecutorServiceRunFlowTestScope,
  defineHealthNodesTests,
  defineVariableNodesTests,
  defineArithmeticTemplatesTests,
} from './resource-flows-executor.service.spec.define-resource-flows-executor-service-run-flow-tests';
export { HealthNodesTestScope } from './resource-flows-executor.service.spec.health-nodes-test-scope';
export { defineResourceFlowsExecutorServiceMqttTests } from './resource-flows-executor.service.spec.define-resource-flows-executor-service-mqtt-tests';
export { ResourceFlowsExecutorServiceMqttTestScope } from './resource-flows-executor.service.spec.resource-flows-executor-service-mqtt-test-scope';
export { VariableNodesTestScope } from './resource-flows-executor.service.spec.variable-nodes-test-scope';
export { ArithmeticTemplatesTestScope } from './resource-flows-executor.service.spec.arithmetic-templates-test-scope';
