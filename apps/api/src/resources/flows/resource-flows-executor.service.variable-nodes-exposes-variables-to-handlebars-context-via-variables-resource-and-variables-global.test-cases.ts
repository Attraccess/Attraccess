import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { VariableNodesTestScope } from './resource-flows-executor.service.spec';
export function registerVariableNodesExposesVariablesToHandlebarsContextViaVariablesResourceAndVariablesGlobal(
  scope: VariableNodesTestScope,
): void {
  it('exposes variables to Handlebars context via {{variables.resource.*}} and {{variables.global.*}}', async () => {
    (scope.variablesService.getAll as jest.Mock).mockResolvedValue({
      resource: { foo: 1 },
      global: { bar: 'x' },
    });

    const inputNode = scope.createNode({ id: 't', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1 });
    const setNode = scope.createNode({
      id: 'set-1',
      type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
      resourceId: 1,
      data: {
        variables: [
          { key: 'rendered', value: '{{variables.resource.foo}}-{{variables.global.bar}}', scope: 'resource' },
        ],
      },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[setNode.id] = setNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

    expect(scope.variablesService.set).toHaveBeenCalledWith('resource', 1, 'rendered', '1-x', 1);
  });
}
