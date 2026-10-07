import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerArithmeticTemplatesCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  describe('arithmetic templates', () => {
    it('converts units in Set Payload using stored variables and publishes the converted fields', async () => {
      (fixture.variablesService.getAll as jest.Mock).mockResolvedValue({ resource: { scale: 1000 }, global: {} });
      const inputNode = fixture.createNode({ id: 'arithmetic-trigger' });
      const setNode = fixture.createNode({
        id: 'arithmetic-payload',
        type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
        data: {
          entries: [
            { key: 'converted.energy_kwh', value: '{{divide payload.energy_wh variables.resource.scale}}' },
            { key: 'converted.fahrenheit', value: '{{add (divide (multiply payload.celsius 9) 5) 32}}' },
          ],
        },
      });
      const mqttNode = fixture.createNode({
        id: 'arithmetic-mqtt',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 42, topic: 'devices/converted', payload: '{{json converted}}' },
      });
      fixture.initialNodes = [inputNode];
      fixture.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode, [mqttNode.id]: mqttNode };
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [{ source: setNode.id, target: mqttNode.id }];

      await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {
        payload: { energy_wh: '1500', celsius: 20 },
      });

      expect(fixture.mqttClientService.publish).toHaveBeenCalledWith(
        42,
        'devices/converted',
        '{"energy_kwh":"1.5","fahrenheit":"68"}',
        { qos: undefined, retain: undefined },
      );
    });

    it('stores the result of an arithmetic template as a numeric variable', async () => {
      const inputNode = fixture.createNode({ id: 'arithmetic-trigger' });
      const setNode = fixture.createNode({
        id: 'arithmetic-variable',
        type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
        data: {
          variables: [{ key: 'energy_kwh', value: '{{divide payload.energy_wh 1000}}', scope: 'resource' }],
        },
      });
      fixture.initialNodes = [inputNode];
      fixture.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode };
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];

      await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { energy_wh: 1500 } });

      expect(fixture.variablesService.set).toHaveBeenCalledWith('resource', 1, 'energy_kwh', 1.5, 1);
    });

    it.each([0, undefined, 'not-a-number'])('stops a node with invalid arithmetic input %p', async (divisor) => {
      const inputNode = fixture.createNode({ id: 'arithmetic-trigger' });
      const setNode = fixture.createNode({
        id: 'arithmetic-payload',
        type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
        data: { entries: [{ key: 'converted', value: '{{divide payload.value payload.divisor}}' }] },
      });
      const mqttNode = fixture.createNode({
        id: 'arithmetic-mqtt',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 42, topic: 'devices/converted', payload: '{{converted}}' },
      });
      fixture.initialNodes = [inputNode];
      fixture.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode, [mqttNode.id]: mqttNode };
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [{ source: setNode.id, target: mqttNode.id }];

      await expect(
        fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { value: 1500, divisor } }),
      ).rejects.toThrow('Template helper "divide"');
      expect(fixture.mqttClientService.publish).not.toHaveBeenCalled();
    });
  });
}
