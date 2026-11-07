import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType, Flow } from '@attraccess/database-entities';
import { GlobalFlowsService } from './global-flows.service';
import { ResourceFlowsService } from './resource-flows.service';
import { getCoreNodeFlowScopes } from './schemas/core-node-schemas';
import { getNodeFlowScopes } from './schemas/node-flow-scopes';

const T = ResourceFlowNodeType;

describe('node flow scopes', () => {
  it('limits button and metering nodes to resource flows and allows everything else in both', () => {
    const resourceOnly = [
      T.INPUT_BUTTON,
      T.INPUT_METERING_START,
      T.INPUT_METERING_COLLECT,
      T.OUTPUT_METERING_READY,
      T.OUTPUT_METERING_REPORT,
    ];
    for (const type of Object.values(T)) {
      expect(getCoreNodeFlowScopes(type)).toEqual(resourceOnly.includes(type) ? ['resource'] : ['resource', 'global']);
    }
  });

  it('knows no scopes for unknown types', () => {
    expect(getNodeFlowScopes('plugin.nobody.unknown')).toBeUndefined();
  });
});

describe('GlobalFlowsService', () => {
  const flow = Object.assign(new Flow(), { id: 5, name: 'Notify', description: null, enabled: true, scope: 'global' });
  const manager = {
    find: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(async (_entity: unknown, rows: unknown) => rows),
  };
  const flowRepository = {
    findOne: jest.fn(),
    save: jest.fn(async (row: Flow) => row),
    create: jest.fn((row) => row),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const nodeRepository = { manager: { transaction: jest.fn(async (work) => work(manager)) }, find: jest.fn() };
  const edgeRepository = { find: jest.fn() };
  const subscribe = jest.fn();
  const resourceFlows = new ResourceFlowsService(
    nodeRepository as never,
    edgeRepository as never,
    {} as never,
    { subscribe: subscribe.mockResolvedValue(undefined) } as never,
    { emit: jest.fn() } as never,
    flowRepository as never,
  );
  const service = new GlobalFlowsService(
    flowRepository as never,
    nodeRepository as never,
    edgeRepository as never,
    resourceFlows,
  );

  const position = { x: 0, y: 0 };

  beforeEach(() => {
    jest.clearAllMocks();
    flowRepository.findOne.mockResolvedValue(flow);
    manager.find.mockResolvedValue([]);
    flow.enabled = true;
  });

  it('saves nodes and edges with flowId and without resourceId', async () => {
    const result = await service.saveCanvas(5, {
      nodes: [
        { id: 'a', type: T.INPUT_RESOURCE_USAGE_STARTED, position, data: {} },
        { id: 'b', type: T.OUTPUT_HTTP_SEND_REQUEST, position, data: { url: 'https://example.com', method: 'POST' } },
      ],
      edges: [{ id: 'e', source: 'a', sourceHandle: 'output', target: 'b', targetHandle: 'input' }],
    });

    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowNode, { flowId: 5 });
    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowEdge, { flowId: 5 });
    expect(result.nodes.every((node) => node.flowId === 5 && node.resourceId === null)).toBe(true);
    expect(result.edges[0]).toMatchObject({ flowId: 5, resourceId: null });
  });

  it('rejects a canvas with a node that is resource-only and names it', async () => {
    await expect(
      service.saveCanvas(5, {
        nodes: [
          { id: 'ok', type: T.INPUT_RESOURCE_USAGE_STARTED, position, data: {} },
          { id: 'btn-1', type: T.INPUT_BUTTON, position, data: { label: 'Go' } },
        ],
        edges: [],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.saveCanvas(5, { nodes: [{ id: 'btn-1', type: T.INPUT_BUTTON, position, data: {} }], edges: [] }),
    ).rejects.toMatchObject({
      response: { message: [expect.stringContaining('btn-1')], nodes: [{ nodeId: 'btn-1', nodeType: T.INPUT_BUTTON }] },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('subscribes to MQTT topics of new nodes of an enabled flow only', async () => {
    const mqtt = { id: 'm', type: T.INPUT_MQTT_MESSAGE_RECEIVED, position, data: { serverId: 2, topic: 'a/b' } };
    await service.saveCanvas(5, { nodes: [mqtt], edges: [] });
    expect(subscribe).toHaveBeenCalledWith(2, 'a/b');

    subscribe.mockClear();
    flow.enabled = false;
    await service.saveCanvas(5, { nodes: [mqtt], edges: [] });
    expect(subscribe).not.toHaveBeenCalled();

    // Turning the flow on subscribes the topics of its stored nodes.
    nodeRepository.find.mockResolvedValue([{ ...mqtt, flowId: 5 }]);
    await service.update(5, { enabled: true });
    expect(subscribe).toHaveBeenCalledWith(2, 'a/b');
  });

  it('reports a missing flow', async () => {
    flowRepository.findOne.mockResolvedValue(null);
    await expect(service.getCanvas(99)).rejects.toThrow(NotFoundException);
    await expect(service.delete(99)).rejects.toThrow(NotFoundException);
  });

  it('deletes the flow row only: nodes and edges go by cascade', async () => {
    await service.delete(5);
    expect(flowRepository.delete).toHaveBeenCalledWith({ id: 5 });
  });

  it('refuses to resolve a resource-only plugin node for a global flow', async () => {
    const { registerPluginFlowNodes } = await import('../../plugin-system/flows/node-registry');
    registerPluginFlowNodes('scope-test', [
      {
        type: 'plugin.scope-test.default',
        label: 'd',
        configSchema: {},
        inputs: ['input'],
        outputs: [],
        execute: jest.fn(),
      },
      {
        type: 'plugin.scope-test.both',
        label: 'b',
        configSchema: {},
        inputs: ['input'],
        outputs: [],
        flowScopes: ['resource', 'global'],
        execute: jest.fn(),
      },
    ]);
    await expect(service.resolveNodeSchema(5, 'plugin.scope-test.default', {})).rejects.toThrow(BadRequestException);
    await expect(service.resolveNodeSchema(5, 'plugin.scope-test.both', {})).resolves.toMatchObject({
      supportedFlowScopes: ['resource', 'global'],
    });
    const schemas = await service.getNodeSchemas();
    expect(schemas.find((s) => s.type === 'plugin.scope-test.default')?.supportedFlowScopes).toEqual(['resource']);
  });
});
