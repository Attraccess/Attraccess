import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowCarriesLifecycleStagingIdentityThroughDownstreamFlowNodes(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('carries lifecycle staging identity through downstream flow nodes', async () => {
    const inputNode = scope.createNode({
      id: 'lifecycle-input',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    });
    const operatingNode = scope.createNode({
      id: 'operating-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING,
    });
    const billingNode = scope.createNode({
      id: 'billing-node',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: { name: 'Energy', description: 'Meter', unitPrice: 5, quantity: 2 },
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [operatingNode.id]: operatingNode, [billingNode.id]: billingNode };
    scope.edgesBySourceAndHandle = {
      [`${inputNode.id}|`]: [{ source: inputNode.id, target: operatingNode.id }],
      [`${operatingNode.id}|`]: [{ source: operatingNode.id, target: billingNode.id }],
    };

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, { id: 12 }, undefined, {
      lifecycleAttemptId: 'lifecycle-attempt',
    });

    expect(scope.resourceUsageService.stageLifecycleBillingItem).toHaveBeenCalledWith('lifecycle-attempt', 1, 12, {
      name: 'Energy',
      description: 'Meter',
      unitPrice: 5,
      quantity: 2,
      externalReference: null,
    });
  });
}
