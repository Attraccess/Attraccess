import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';

jest.mock('axios');
export function registerVariableNodesCases(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  describe('variable nodes', () => {
    it('PROCESSING_SET_VARIABLES renders templates and stores JSON-parsed values', async () => {
      const setNode = fixture.createNode({
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
      const inputNode = fixture.createNode({
        id: 'trigger-1',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId: 1,
      });
      fixture.nodesById[inputNode.id] = inputNode;
      fixture.nodesById[setNode.id] = setNode;
      fixture.initialNodes = [inputNode];
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { n: 5, who: 'world' } });

      expect(fixture.variablesService.set).toHaveBeenCalledTimes(2);
      expect(fixture.variablesService.set).toHaveBeenNthCalledWith(1, 'global', null, 'count', 5, 1);
      expect(fixture.variablesService.set).toHaveBeenNthCalledWith(2, 'resource', 1, 'note', 'hello world', 1);
    });

    it('serializes an object payload for a downstream MQTT message using {{json payload}}', async () => {
      const inputNode = fixture.createNode({ id: 'trigger-1', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1 });
      const mqttNode = fixture.createNode({
        id: 'mqtt-1',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        resourceId: 1,
        data: { serverId: 42, topic: 'devices/update', payload: '{{json payload}}', qos: 1, retain: false },
      });
      fixture.nodesById[inputNode.id] = inputNode;
      fixture.nodesById[mqttNode.id] = mqttNode;
      fixture.initialNodes = [inputNode];
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
      fixture.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];

      await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { enabled: true } });

      expect(fixture.mqttClientService.publish).toHaveBeenCalledWith(42, 'devices/update', '{"enabled":true}', {
        qos: 1,
        retain: false,
      });
    });

    it('PROCESSING_GET_VARIABLES writes lodash-set into payload', async () => {
      (fixture.variablesService.get as jest.Mock).mockImplementation(async (_scope, _rid, key) =>
        key === 'sessionId' ? 99 : undefined,
      );

      const inputNode = fixture.createNode({ id: 't', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1 });
      const getNode = fixture.createNode({
        id: 'get-1',
        type: ResourceFlowNodeType.PROCESSING_GET_VARIABLES,
        resourceId: 1,
        data: {
          variables: [{ key: 'sessionId', scope: 'resource', payloadPath: 'session.id' }],
        },
      });
      fixture.nodesById[inputNode.id] = inputNode;
      fixture.nodesById[getNode.id] = getNode;
      fixture.initialNodes = [inputNode];
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: getNode.id }];
      fixture.edgesBySourceAndHandle[`${getNode.id}|`] = [];

      const result = await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(result[0]).toMatchObject({ session: { id: 99 } });
      expect(fixture.variablesService.get).toHaveBeenCalledWith('resource', 1, 'sessionId');
    });

    it('exposes variables to Handlebars context via {{variables.resource.*}} and {{variables.global.*}}', async () => {
      (fixture.variablesService.getAll as jest.Mock).mockResolvedValue({
        resource: { foo: 1 },
        global: { bar: 'x' },
      });

      const inputNode = fixture.createNode({ id: 't', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId: 1 });
      const setNode = fixture.createNode({
        id: 'set-1',
        type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
        resourceId: 1,
        data: {
          variables: [
            { key: 'rendered', value: '{{variables.resource.foo}}-{{variables.global.bar}}', scope: 'resource' },
          ],
        },
      });
      fixture.nodesById[inputNode.id] = inputNode;
      fixture.nodesById[setNode.id] = setNode;
      fixture.initialNodes = [inputNode];
      fixture.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      fixture.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await fixture.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(fixture.variablesService.set).toHaveBeenCalledWith('resource', 1, 'rendered', '1-x', 1);
    });
  });
}
