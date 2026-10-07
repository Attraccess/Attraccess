import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerCarriesLifecycleStagingIdentityThroughDownstreamFlowNodesCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('carries lifecycle staging identity through downstream flow nodes', async () => {
    const inputNode = fixture.createNode({
      id: 'lifecycle-input',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    });
    const operatingNode = fixture.createNode({
      id: 'operating-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    });
    const billingNode = fixture.createNode({
      id: 'billing-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: { name: 'Energy', description: 'Meter', unitPrice: 5, quantity: 2 },
    });
    fixture.initialNodes = [inputNode];
    fixture.nodesById = { [inputNode.id]: inputNode, [operatingNode.id]: operatingNode, [billingNode.id]: billingNode };
    fixture.edgesBySourceAndHandle = {
      [`${inputNode.id}|`]: [{ source: inputNode.id, target: operatingNode.id }],
      [`${operatingNode.id}|`]: [{ source: operatingNode.id, target: billingNode.id }],
    };

    await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, { id: 12 }, undefined, {
      lifecycleAttemptId: 'lifecycle-attempt',
    });

    expect(fixture.resourceUsageService.stageLifecycleBillingItem).toHaveBeenCalledWith('lifecycle-attempt', 1, 12, {
      name: 'Energy',
      description: 'Meter',
      unitPrice: 5,
      quantity: 2,
      externalReference: null,
    });
  });
}
