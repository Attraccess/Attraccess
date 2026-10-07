import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerHandlesASimpleLinearPathAndReturnsTheLastNodePayloadCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  it('handles a simple linear path and returns the last node payload', async () => {
    const inputNode = fixture.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const billingNode = fixture.createNode({
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
    fixture.nodesById[inputNode.id] = inputNode;
    fixture.nodesById[billingNode.id] = billingNode;
    fixture.initialNodes = [inputNode];

    // Edge: input -> billing (no sourceHandle filter)
    fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: billingNode.id }];
    // Billing is terminal
    fixture.edgesBySourceAndHandle[`${billingNode.id}|`] = [];

    const initialData = {};

    const result = await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
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
