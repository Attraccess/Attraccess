import { registerFlowDefinedEnergyMeteringFixture } from './resource-metering.persistence.flow-defined-energy-metering.test-fixture';
import { registerMeterDefinitionCases } from './resource-metering.persistence.flow-defined-energy-metering.meter-definition.test-cases';
import { registerUsageLifecycleCases } from './resource-metering.persistence.flow-defined-energy-metering.usage-lifecycle.behaviors.test-cases';
import { registerOperationsCases } from './resource-metering.persistence.flow-defined-energy-metering.operations.test-cases';
describe('Flow-defined energy metering', () => {
  const fixture = registerFlowDefinedEnergyMeteringFixture();
  registerMeterDefinitionCases(fixture);
  registerUsageLifecycleCases(fixture);
  registerOperationsCases(fixture);
});
