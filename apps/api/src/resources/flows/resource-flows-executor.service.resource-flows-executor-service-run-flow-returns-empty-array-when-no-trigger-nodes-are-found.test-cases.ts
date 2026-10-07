import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowReturnsEmptyArrayWhenNoTriggerNodesAreFound(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('returns empty array when no trigger nodes are found', async () => {
    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, {
      any: 'data',
    });
    expect(result).toEqual([]);
    expect(scope.flowNodeRepository.find as jest.Mock).toHaveBeenCalled();
  });
}
