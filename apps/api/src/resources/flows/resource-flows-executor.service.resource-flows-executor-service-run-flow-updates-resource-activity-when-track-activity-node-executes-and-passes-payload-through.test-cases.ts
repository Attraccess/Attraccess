import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowUpdatesResourceActivityWhenTrackActivityNodeExecutesAndPassesPayloadThrough(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('updates resource activity when track-activity node executes and passes payload through', async () => {
    const resourceId = 5;
    const inputNode = scope.createNode({ id: 'in-activity', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const trackNode = scope.createNode({
      id: 'track-activity',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY,
      resourceId,
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[trackNode.id] = trackNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: trackNode.id }];
    scope.edgesBySourceAndHandle[`${trackNode.id}|`] = [];

    const payload = { foo: 'bar' };

    const resourceActivity = (scope.service as unknown as { resourceActivity: Map<number, Date> }).resourceActivity;

    expect(resourceActivity.get(resourceId)).toBeUndefined();

    const result = await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, payload);

    expect(result).toEqual([
      {
        ...payload,
        resource: { id: 5, name: 'Resource 5', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
    const lastActivity = resourceActivity.get(resourceId);
    expect(lastActivity).toBeInstanceOf(Date);
  });
}
