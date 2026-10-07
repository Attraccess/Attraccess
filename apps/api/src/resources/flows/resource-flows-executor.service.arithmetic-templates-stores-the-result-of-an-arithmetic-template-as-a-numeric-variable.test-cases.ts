import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ArithmeticTemplatesTestScope } from './resource-flows-executor.service.spec';
export function registerArithmeticTemplatesStoresTheResultOfAnArithmeticTemplateAsANumericVariable(
  scope: ArithmeticTemplatesTestScope,
): void {
  it('stores the result of an arithmetic template as a numeric variable', async () => {
    const inputNode = scope.createNode({ id: 'arithmetic-trigger' });
    const setNode = scope.createNode({
      id: 'arithmetic-variable',
      type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
      data: {
        variables: [{ key: 'energy_kwh', value: '{{divide payload.energy_wh 1000}}', scope: 'resource' }],
      },
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode };
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { energy_wh: 1500 } });

    expect(scope.variablesService.set).toHaveBeenCalledWith('resource', 1, 'energy_kwh', 1.5, 1);
  });
}
