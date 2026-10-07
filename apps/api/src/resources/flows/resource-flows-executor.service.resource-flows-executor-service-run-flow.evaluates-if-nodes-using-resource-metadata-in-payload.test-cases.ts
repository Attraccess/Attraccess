import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerEvaluatesIfNodesUsingResourceMetadataInPayloadCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('evaluates IF nodes using resource metadata in payload', async () => {
    const inputNode = fixture.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const ifNode = fixture.createNode({
      id: 'if-1',
      type: ResourceFlowNodeType.PROCESSING_IF,
      data: {
        path: 'resource.metadata.zone',
        comparisonOperator: '=',
        comparisonValue: 'B',
        comparisonValueIsPath: false,
      },
    });
    const billingNode = fixture.createNode({
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

    [inputNode, ifNode, billingNode].forEach((n) => (fixture.nodesById[n.id] = n));
    fixture.initialNodes = [inputNode];

    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: ifNode.id }];
    fixture.edgesBySourceAndHandle[`${ifNode.id}|output-true`] = [
      { source: ifNode.id, target: billingNode.id, sourceHandle: 'output-true' },
    ];
    fixture.edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    (fixture.resourceRepository.findOne as jest.Mock).mockResolvedValueOnce({
      id: 1,
      name: 'Resource 1',
      type: ResourceType.Machine,
      metadata: { zone: 'B' },
    });

    const result = await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {});

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
