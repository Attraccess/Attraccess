import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { VariableNodesTestScope } from './resource-flows-executor.service.spec';
export function registerVariableNodesProcessingGetVariablesWritesLodashSetIntoPayload(
  scope: VariableNodesTestScope,
): void {
  it('PROCESSING_GET_VARIABLES writes lodash-set into payload', async () => {
    (scope.variablesService.get as jest.Mock).mockImplementation(async (_scope, _rid, key) =>
      key === 'sessionId' ? 99 : undefined,
    );

    const inputNode = scope.createNode({ id: 't', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1 });
    const getNode = scope.createNode({
      id: 'get-1',
      type: ResourceFlowNodeType.PROCESSING_GET_VARIABLES,
      resourceId: 1,
      data: {
        variables: [{ key: 'sessionId', scope: 'resource', payloadPath: 'session.id' }],
      },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[getNode.id] = getNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: getNode.id }];
    scope.edgesBySourceAndHandle[`${getNode.id}|`] = [];

    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(result[0]).toMatchObject({ session: { id: 99 } });
    expect(scope.variablesService.get).toHaveBeenCalledWith('resource', 1, 'sessionId');
  });
}
