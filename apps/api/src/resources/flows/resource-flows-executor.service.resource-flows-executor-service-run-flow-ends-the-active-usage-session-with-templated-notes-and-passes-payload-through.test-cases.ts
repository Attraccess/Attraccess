import { ResourceFlowNodeType, ResourceType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceRunFlowTestScope } from './resource-flows-executor.service.spec';
export function registerResourceFlowsExecutorServiceRunFlowEndsTheActiveUsageSessionWithTemplatedNotesAndPassesPayloadThrough(
  scope: ResourceFlowsExecutorServiceRunFlowTestScope,
): void {
  it('ends the active usage session with templated notes and passes payload through', async () => {
    // Arrange nodes: INPUT -> END_SESSION (terminal)
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const endNode = scope.createNode({
      id: 'end-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      data: { notes: 'Ended by {{user.username}}' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[endNode.id] = endNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    scope.edgesBySourceAndHandle[`${endNode.id}|`] = [];

    // Mock active session and endSession
    (scope.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue({
      id: 'ru-1',
      user: { id: 42, username: 'alice' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (scope.resourceUsageService as any).endSession = jest.fn().mockResolvedValue(undefined);

    const initialData = { user: { username: 'bob' } };

    // Act
    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);

    // Assert leaf payload passthrough
    expect(result).toEqual([
      {
        ...initialData,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);

    // Assert endSession called with compiled notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((scope.resourceUsageService as any).endSession).toHaveBeenCalledWith(
      1,
      { id: 42, username: 'alice' },
      {
        notes: 'Ended by bob',
      },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
  });
}
