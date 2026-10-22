import { flowOperationsFake } from './persistence/operations.test-fixture';
import { createMock } from '@golevelup/ts-jest';
import type { PluginFlowTriggerNodeDefinition } from '@attraccess/plugins-backend-sdk/v2';
import { Resource, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { registerPluginFlowNodes } from '../../plugin-system/flows/node-registry';
import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';
import { ResourceFlowsService } from './resource-flows.service';

it('reports invalid plugin trigger configuration when loading a saved flow', async () => {
  const definition: PluginFlowTriggerNodeDefinition = {
    type: 'plugin.validation-test.event',
    label: 'Event',
    isInput: true,
    inputs: [],
    outputs: ['output'],
    validateConfig: jest.fn().mockResolvedValue([{ field: 'channelId', message: 'Select an applied channel.' }]),
  };
  registerPluginFlowNodes('validation-test', [definition]);
  const node = Object.assign({} as ResourceFlowNode, { id: 'event', type: definition.type, data: {} });
  const fake = flowOperationsFake();
  fake.persistence.graphNodes.mockResolvedValue([node]);
  fake.persistence.findResource.mockResolvedValue({ id: 1 } as Resource);
  const service = new ResourceFlowsService(
    fake.persistence,
    fake.driver.transactions,
    createMock<MqttClientService>(),
    new EventEmitter2(),
  );
  await expect(service.getResourceFlow(1)).resolves.toMatchObject({
    validationErrors: [
      { nodeId: 'event', nodeType: definition.type, field: 'channelId', message: 'Select an applied channel.' },
    ],
  });
});

describe('saving MQTT flow subscriptions', () => {
  const resource = Object.assign({} as Resource, { id: 1 });
  const oldNodes: ResourceFlowNode[] = [];
  const fake = flowOperationsFake();
  const mqtt = createMock<MqttClientService>();
  const events = new EventEmitter2();
  const service = new ResourceFlowsService(fake.persistence, fake.driver.transactions, mqtt, events);
  const node = (id: string, type: ResourceFlowNodeType, topic: string, serverId = 2) => ({
    id,
    type,
    position: { x: 10, y: 20 },
    data: { topic, serverId },
  });
  beforeEach(() => {
    jest.clearAllMocks();
    oldNodes.length = 0;
    fake.persistence.findResource.mockResolvedValue(resource);
    fake.writes.nodesByType.mockImplementation(async (_id, type) => oldNodes.filter((node) => node.type === type));
    mqtt.subscribe.mockResolvedValue(undefined);
    jest.spyOn(events, 'emit');
  });
  afterEach(() => jest.restoreAllMocks());
  it('persists node positions and edges, subscribing only new or changed MQTT nodes', async () => {
    const receive = ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED;
    const wait = ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE;
    const nodes = [
      node('same', receive, 'same'),
      node('changed', receive, 'new'),
      node('new-wait', wait, 'wait'),
      node('same-wait', wait, 'same-wait'),
      node('changed-wait', wait, 'changed-wait', 3),
    ];
    oldNodes.push(
      ...[
        node('same', receive, 'same'),
        node('changed', receive, 'old'),
        node('same-wait', wait, 'same-wait'),
        node('changed-wait', wait, 'changed-wait', 2),
      ].map((value) => Object.assign({} as ResourceFlowNode, value)),
    );
    const edges = [{ id: 'edge', source: 'same', target: 'new-wait', sourceHandle: 'output', targetHandle: 'input' }];
    const result = await service.saveResourceFlow(1, { nodes, edges });
    expect(mqtt.subscribe.mock.calls).toEqual([
      [2, 'new'],
      [2, 'wait'],
      [3, 'changed-wait'],
    ]);
    expect(fake.writes.replaceGraph).toHaveBeenCalledWith(
      resource,
      expect.arrayContaining([expect.objectContaining({ id: 'same', position: { x: 10, y: 20 } })]),
      edges,
    );
    expect(result.nodes[0]).toMatchObject({ id: 'same', position: { x: 10, y: 20 }, resource });
    expect(result.edges[0]).toMatchObject({ ...edges[0], resource });
    expect(events.emit).toHaveBeenCalledWith(ResourceFlowChangedEvent.EVENT_NAME, 1);
  });
  it('retains invalid drafts with validation errors but skips incomplete subscriptions', async () => {
    const result = await service.saveResourceFlow(1, {
      nodes: [node('invalid', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, '')],
      edges: [],
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.validationErrors).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'invalid' })]));
    expect(mqtt.subscribe).not.toHaveBeenCalled();
  });
  it('does not subscribe or announce when commit fails after writing the graph', async () => {
    const executeTransaction = fake.driver.run.getMockImplementation();
    fake.driver.run.mockImplementationOnce(async (conflicts, work) => {
      await executeTransaction(conflicts, work);
      throw new Error('commit rejected');
    });
    await expect(
      service.saveResourceFlow(1, {
        nodes: [node('new', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, 'new-topic')],
        edges: [],
      }),
    ).rejects.toThrow('commit rejected');
    expect(mqtt.subscribe).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not announce a flow change when persistence fails', async () => {
    fake.writes.replaceGraph.mockRejectedValueOnce(new Error('database rejected write'));
    await expect(service.saveResourceFlow(1, { nodes: [], edges: [] })).rejects.toThrow('database rejected write');
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('plugin node configuration schemas', () => {
  const fake = flowOperationsFake();
  const service = new ResourceFlowsService(
    fake.persistence,
    fake.driver.transactions,
    createMock<MqttClientService>(),
    new EventEmitter2(),
  );
  it('resolves dynamic schemas with resource context and falls back to static schemas', async () => {
    fake.persistence.findResource.mockResolvedValue({ id: 1 } as Resource);
    const schema = { type: 'object', properties: { channelId: { type: 'string' } } };
    const resolve = jest.fn().mockResolvedValue(schema);
    registerPluginFlowNodes('schema-test', [
      {
        type: 'plugin.schema-test.dynamic',
        label: 'Dynamic',
        isInput: true,
        inputs: [],
        outputs: ['output'],
        resolveConfigSchema: resolve,
      },
      {
        type: 'plugin.schema-test.static',
        label: 'Static',
        isInput: true,
        inputs: [],
        outputs: ['output'],
        configSchema: schema,
      },
      { type: 'plugin.schema-test.empty', label: 'Empty', isInput: true, inputs: [], outputs: ['output'] },
    ]);
    expect(await service.resolveNodeSchema(1, 'plugin.schema-test.dynamic', { controllerId: 7 })).toMatchObject({
      configSchema: schema,
    });
    expect(resolve).toHaveBeenCalledWith({ controllerId: 7 }, { resourceId: 1 });
    expect(
      await service.resolveNodeSchema(1, 'plugin.schema-test.dynamic', { controllerId: 7 }, 'preview'),
    ).toMatchObject({
      configSchema: { properties: {}, preview: [] },
    });
    expect(resolve).toHaveBeenLastCalledWith({ controllerId: 7 }, { resourceId: 1, purpose: 'preview' });
    expect(await service.resolveNodeSchema(1, 'plugin.schema-test.static', {})).toMatchObject({ configSchema: schema });
    await expect(service.resolveNodeSchema(1, 'plugin.schema-test.empty', {})).rejects.toThrow('does not provide');
    await expect(service.resolveNodeSchema(1, 'plugin.schema-test.missing', {})).rejects.toThrow('not found');
    fake.persistence.findResource.mockResolvedValue(null);
    await expect(service.resolveNodeSchema(99, 'plugin.schema-test.static', {})).rejects.toThrow();
  });
});
