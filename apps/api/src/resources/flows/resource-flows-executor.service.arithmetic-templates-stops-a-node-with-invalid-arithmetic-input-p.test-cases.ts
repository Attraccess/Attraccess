import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ArithmeticTemplatesTestScope } from './resource-flows-executor.service.spec';
export function registerArithmeticTemplatesStopsANodeWithInvalidArithmeticInputP(
  scope: ArithmeticTemplatesTestScope,
): void {
  it.each([0, undefined, 'not-a-number'])('stops a node with invalid arithmetic input %p', async (divisor) => {
    const inputNode = scope.createNode({ id: 'arithmetic-trigger' });
    const setNode = scope.createNode({
      id: 'arithmetic-payload',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: { entries: [{ key: 'converted', value: '{{divide payload.value payload.divisor}}' }] },
    });
    const mqttNode = scope.createNode({
      id: 'arithmetic-mqtt',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 42, topic: 'devices/converted', payload: '{{converted}}' },
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode, [mqttNode.id]: mqttNode };
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [{ source: setNode.id, target: mqttNode.id }];

    await expect(
      scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { value: 1500, divisor } }),
    ).rejects.toThrow('Template helper "divide"');
    expect(scope.mqttClientService.publish).not.toHaveBeenCalled();
  });
}
