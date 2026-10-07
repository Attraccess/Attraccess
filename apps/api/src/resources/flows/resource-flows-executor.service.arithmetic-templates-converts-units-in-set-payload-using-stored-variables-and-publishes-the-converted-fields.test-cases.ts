import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ArithmeticTemplatesTestScope } from './resource-flows-executor.service.spec';
export function registerArithmeticTemplatesConvertsUnitsInSetPayloadUsingStoredVariablesAndPublishesTheConvertedFields(
  scope: ArithmeticTemplatesTestScope,
): void {
  it('converts units in Set Payload using stored variables and publishes the converted fields', async () => {
    (scope.variablesService.getAll as jest.Mock).mockResolvedValue({ resource: { scale: 1000 }, global: {} });
    const inputNode = scope.createNode({ id: 'arithmetic-trigger' });
    const setNode = scope.createNode({
      id: 'arithmetic-payload',
      type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
      data: {
        entries: [
          { key: 'converted.energy_kwh', value: '{{divide payload.energy_wh variables.resource.scale}}' },
          { key: 'converted.fahrenheit', value: '{{add (divide (multiply payload.celsius 9) 5) 32}}' },
        ],
      },
    });
    const mqttNode = scope.createNode({
      id: 'arithmetic-mqtt',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 42, topic: 'devices/converted', payload: '{{json converted}}' },
    });
    scope.initialNodes = [inputNode];
    scope.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode, [mqttNode.id]: mqttNode };
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
    scope.edgesBySourceAndHandle[`${setNode.id}|`] = [{ source: setNode.id, target: mqttNode.id }];

    await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { energy_wh: '1500', celsius: 20 } });

    expect(scope.mqttClientService.publish).toHaveBeenCalledWith(
      42,
      'devices/converted',
      '{"energy_kwh":"1.5","fahrenheit":"68"}',
      { qos: undefined, retain: undefined },
    );
  });
}
