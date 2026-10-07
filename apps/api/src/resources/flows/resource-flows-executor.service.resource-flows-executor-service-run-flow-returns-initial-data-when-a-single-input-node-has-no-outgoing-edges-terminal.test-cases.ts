import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowReturnsInitialDataWhenASingleInputNodeHasNoOutgoingEdgesTerminal(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('returns initial data when a single input node has no outgoing edges (terminal)', async () => {
    const inputNode = scope.createNode({
      id: 'in-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
      resourceId: 1,
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.initialNodes = [inputNode];

    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [];

    const initialData = { a: 1 };
    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);
    expect(result).toEqual([
      {
        ...initialData,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
  });
}
