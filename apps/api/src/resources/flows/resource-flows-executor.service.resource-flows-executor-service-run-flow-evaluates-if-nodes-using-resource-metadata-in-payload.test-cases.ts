import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowEvaluatesIfNodesUsingResourceMetadataInPayload(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('evaluates IF nodes using resource metadata in payload', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const ifNode = scope.createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'resource.metadata.zone',
        comparisonOperator: '=',
        comparisonValue: 'B',
        comparisonValueIsPath: false,
      },
    });
    const billingNode = scope.createNode({
      id: 'out-billing-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'zone-fee',
        description: 'Zone specific',
        externalReference: 'zone',
        unitPrice: 3,
        quantity: 1,
      },
    });

    [inputNode, ifNode, billingNode].forEach((n) => (scope.nodesById[n.id] = n));
    scope.initialNodes = [inputNode];

    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    scope.edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNode.id, sourceHandle: 'output-true' },
    ];
    scope.edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    (scope.resourceRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 1,
      name: 'Resource 1',
      type: ResourceType.Machine,
      metadata: { zone: 'B' },
    });

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

    expect(result).toEqual([
      {
        name: 'zone-fee',
        description: 'Zone specific',
        externalReference: 'zone',
        unitPrice: 3,
        quantity: 1,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'B' } },
      },
    ]);
  });
}
