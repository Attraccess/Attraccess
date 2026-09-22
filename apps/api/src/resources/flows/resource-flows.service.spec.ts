import { createMock } from '@golevelup/ts-jest';
import type { PluginFlowTriggerNodeDefinition } from '@attraccess/plugins-backend-sdk';
import { Resource, ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
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
  const node = Object.assign(new ResourceFlowNode(), { id: 'event', type: definition.type, data: {} });
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>({ find: jest.fn().mockResolvedValue([node]) }),
    createMock<Repository<ResourceFlowEdge>>({ find: jest.fn().mockResolvedValue([]) }),
    createMock<Repository<Resource>>({ findOne: jest.fn().mockResolvedValue({ id: 1 }) }),
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
  const resource = Object.assign(new Resource(), { id: 1 });
  const oldNodes: ResourceFlowNode[] = [];
  const manager = createMock<EntityManager>();
  const mqtt = createMock<MqttClientService>();
  const events = new EventEmitter2();
  const resources = createMock<Repository<Resource>>();
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>({ manager }),
    createMock<Repository<ResourceFlowEdge>>(),
    resources,
    mqtt,
    events,
  );
  const node = (id: string, type: ResourceFlowNodeType, topic: string, serverId = 2) => ({
    id,
    type,
    position: { x: 10, y: 20 },
    data: { topic, serverId },
  });
  beforeEach(() => {
    jest.clearAllMocks();
    oldNodes.length = 0;
    resources.findOne.mockResolvedValue(resource);
    manager.transaction.mockImplementation(
      async (
        workOrIsolation: string | ((manager: EntityManager) => Promise<unknown>),
        work?: (manager: EntityManager) => Promise<unknown>,
      ) => {
        if (typeof workOrIsolation === 'function') return workOrIsolation(manager);
        if (!work) throw new Error('Missing transaction callback');
        return work(manager);
      },
    );
    manager.find.mockImplementation(async (_entity, options) =>
      oldNodes.filter((old) => !Array.isArray(options.where) && old.type === options.where.type),
    );
    manager.save.mockImplementation(async (_entity, entities) => entities);
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
      ].map((value) => Object.assign(new ResourceFlowNode(), value)),
    );
    const edges = [{ id: 'edge', source: 'same', target: 'new-wait', sourceHandle: 'output', targetHandle: 'input' }];
    const result = await service.saveResourceFlow(1, { nodes, edges });
    expect(mqtt.subscribe.mock.calls).toEqual([
      [2, 'new'],
      [2, 'wait'],
      [3, 'changed-wait'],
    ]);
    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowNode, { resource: { id: 1 } });
    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowEdge, { resource: { id: 1 } });
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
  it('does not announce a flow change when persistence fails', async () => {
    manager.save.mockRejectedValueOnce(new Error('database rejected write'));
    await expect(service.saveResourceFlow(1, { nodes: [], edges: [] })).rejects.toThrow('database rejected write');
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('plugin node configuration schemas', () => {
  const resources = createMock<Repository<Resource>>();
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>(),
    createMock<Repository<ResourceFlowEdge>>(),
    resources,
    createMock<MqttClientService>(),
    new EventEmitter2(),
  );
  it('resolves dynamic schemas with resource context and falls back to static schemas', async () => {
    resources.findOne.mockResolvedValue({ id: 1 } as Resource);
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
    expect(await service.resolveNodeSchema(1, 'plugin.schema-test.static', {})).toMatchObject({ configSchema: schema });
    await expect(service.resolveNodeSchema(1, 'plugin.schema-test.empty', {})).rejects.toThrow('does not provide');
    await expect(service.resolveNodeSchema(1, 'plugin.schema-test.missing', {})).rejects.toThrow('not found');
    resources.findOne.mockResolvedValue(null);
    await expect(service.resolveNodeSchema(99, 'plugin.schema-test.static', {})).rejects.toThrow();
  });
});
