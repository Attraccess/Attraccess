import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { VariableNodesTestScope } from './resource-flows-executor.service.spec';
export function registerVariableNodesProcessingSetVariablesRendersTemplatesAndStoresJsonParsedValues(
  scope: VariableNodesTestScope,
): void {
  it('PROCESSING_SET_VARIABLES renders templates and stores JSON-parsed values', async () => {
    const setNode = scope.createNode({
      id: 'set-1',
      type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
      resourceId: 1,
      data: {
        variables: [
          { key: 'count', value: '{{payload.n}}', scope: 'global' },
          { key: 'note', value: 'hello {{payload.who}}', scope: 'resource' },
        ],
      },
    });
    const inputNode = scope.createNode({
      id: 'trigger-1',
      type: ResourceFlowNodeType.INPUT_BUTTON,
      resourceId: 1,
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { n: 5, who: 'world' } });

    expect(scope.variablesService.set).toHaveBeenCalledTimes(2);
    expect(scope.variablesService.set).toHaveBeenNthCalledWith(1, 'global', null, 'count', 5, 1);
    expect(scope.variablesService.set).toHaveBeenNthCalledWith(2, 'resource', 1, 'note', 'hello world', 1);
  });
}
