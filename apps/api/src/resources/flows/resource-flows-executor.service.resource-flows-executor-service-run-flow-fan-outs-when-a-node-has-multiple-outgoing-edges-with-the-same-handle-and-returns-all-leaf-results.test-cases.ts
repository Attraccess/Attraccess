import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowFanOutsWhenANodeHasMultipleOutgoingEdgesWithTheSameHandleAndReturnsAllLeafResults(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('fan-outs when a node has multiple outgoing edges with the same handle and returns all leaf results', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const ifNode = scope.createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'flag',
        comparisonOperator: '=',
        comparisonValue: 'yes',
        comparisonValueIsPath: false,
      },
    });
    const billingNodeA = scope.createNode({
      id: 'out-a',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'session-fee',
        description: 'Flat',
        externalReference: 'flat',
        unitPrice: 1,
        quantity: 1,
      },
    });
    const billingNodeB = scope.createNode({
      id: 'out-b',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      data: {
        name: 'session-fee',
        description: 'Flat',
        externalReference: 'flat',
        unitPrice: 1,
        quantity: 1,
      },
    });

    [inputNode, ifNode, billingNodeA, billingNodeB].forEach((n) => (scope.nodesById[n.id] = n));
    scope.initialNodes = [inputNode];

    // input -> if (no handle filter on input)
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    // if -> two billing nodes on the same handle 'output-true'
    scope.edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNodeA.id, sourceHandle: 'output-true' },
      { source: ifNode.id, target: billingNodeB.id, sourceHandle: 'output-true' },
    ];
    // Both billing nodes are terminals
    scope.edgesBySourceAndHandle[`${billingNodeA.id}|`] = [];
    scope.edgesBySourceAndHandle[`${billingNodeB.id}|`] = [];

    const initialData = {
      flag: 'yes',
    };

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    // Both leaves return the same additional item in this setup
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'session-fee',
      description: 'Flat',
      externalReference: 'flat',
      unitPrice: 1,
      quantity: 1,
      resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
    });
    expect(result[1]).toEqual({
      name: 'session-fee',
      description: 'Flat',
      externalReference: 'flat',
      unitPrice: 1,
      quantity: 1,
      resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
    });
  });
}
