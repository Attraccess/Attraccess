import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowHandlesASimpleLinearPathAndReturnsTheLastNodePayload(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('handles a simple linear path and returns the last node payload', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const billingNode = scope.createNode({
      id: 'out-billing-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 1,
        quantity: 2,
      },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[billingNode.id] = billingNode;
    scope.initialNodes = [inputNode];

    // Edge: input -> billing (no sourceHandle filter)
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: billingNode.id }];
    // Billing is terminal
    scope.edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    const initialData = {};

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    expect(result).toEqual([
      {
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 1,
        quantity: 2,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
  });
}
