import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType, Flow } from '@attraccess/database-entities';
import { GlobalFlowsService } from './global-flows.service';
import { ResourceFlowsService } from './resource-flows.service';
import { getCoreNodeFlowScopes } from './schemas/core-node-schemas';
import { getNodeFlowScopes } from './schemas/node-flow-scopes';
import { registerPluginFlowNodes } from '../../plugin-system/flows/node-registry';
import { openFlowCanvasDatabase, startToHttpCanvas, testActor } from './flow-canvas-database.test-fixture';

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
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const resourceFlows = new ResourceFlowsService(
    nodeRepository as never,
    edgeRepository as never,
    {} as never,
    { subscribe: subscribe.mockResolvedValue(undefined) } as never,
    { emit: jest.fn() } as never,
    flowRepository as never,
    audit as never,
  );
  const service = new GlobalFlowsService(
    flowRepository as never,
    nodeRepository as never,
    edgeRepository as never,
    resourceFlows,
    audit as never,
  );

  const position = { x: 0, y: 0 };

  beforeEach(() => {
    jest.clearAllMocks();
    flowRepository.findOne.mockResolvedValue(flow);
    manager.find.mockResolvedValue([]);
    flow.enabled = true;
  });

  it('saves nodes and edges with flowId and without resourceId', async () => {
    const result = await service.saveCanvas(
      5,
      {
        nodes: [
          { id: 'a', type: T.INPUT_RESOURCE_USAGE_STARTED, position, data: {} },
          { id: 'b', type: T.OUTPUT_HTTP_SEND_REQUEST, position, data: { url: 'https://example.com', method: 'POST' } },
        ],
        edges: [{ id: 'e', source: 'a', sourceHandle: 'output', target: 'b', targetHandle: 'input' }],
      },
      testActor,
    );

    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowNode, { flowId: 5 });
    expect(manager.delete).toHaveBeenCalledWith(ResourceFlowEdge, { flowId: 5 });
    expect(result.nodes).toEqual([
      expect.objectContaining({ flowId: 5, resourceId: null }),
      expect.objectContaining({ flowId: 5, resourceId: null }),
    ]);
    expect(result.edges[0]).toMatchObject({ flowId: 5, resourceId: null });
  });

  it('rejects a canvas with a node that is resource-only and names it', async () => {
    await expect(
      service.saveCanvas(
        5,
        {
          nodes: [
            { id: 'ok', type: T.INPUT_RESOURCE_USAGE_STARTED, position, data: {} },
            { id: 'btn-1', type: T.INPUT_BUTTON, position, data: { label: 'Go' } },
          ],
          edges: [],
        },
        testActor,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.saveCanvas(
        5,
        { nodes: [{ id: 'btn-1', type: T.INPUT_BUTTON, position, data: {} }], edges: [] },
        testActor,
      ),
    ).rejects.toMatchObject({
      response: { message: [expect.stringContaining('btn-1')], nodes: [{ nodeId: 'btn-1', nodeType: T.INPUT_BUTTON }] },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('subscribes to MQTT topics of new nodes of an enabled flow only', async () => {
    const mqtt = { id: 'm', type: T.INPUT_MQTT_MESSAGE_RECEIVED, position, data: { serverId: 2, topic: 'a/b' } };
    await service.saveCanvas(5, { nodes: [mqtt], edges: [] }, testActor);
    expect(subscribe).toHaveBeenCalledWith(2, 'a/b');

    subscribe.mockClear();
    flow.enabled = false;
    await service.saveCanvas(5, { nodes: [mqtt], edges: [] }, testActor);
    expect(subscribe).not.toHaveBeenCalled();

    // Turning the flow on subscribes the topics of its stored nodes.
    nodeRepository.find.mockResolvedValue([{ ...mqtt, flowId: 5 }]);
    await service.update(5, { enabled: true });
    expect(subscribe).toHaveBeenCalledWith(2, 'a/b');
  });

  it('only looks up flows of the global scope', async () => {
    await service.get(5);
    expect(flowRepository.findOne).toHaveBeenCalledWith({ where: { id: 5, scope: 'global' } });
  });

  describe('name, description and enabled', () => {
    it('rejects a null or blank name and a null enabled with 400 and saves nothing', async () => {
      for (const dto of [{ name: null }, { name: '   ' }, { enabled: null }]) {
        await expect(service.update(5, dto as never)).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(service.create({ name: '  ' })).rejects.toBeInstanceOf(BadRequestException);
      expect(flowRepository.save).not.toHaveBeenCalled();
    });

    it('trims the name and clears the description with null', async () => {
      flowRepository.findOne.mockResolvedValue({ ...flow, description: 'old' });
      await expect(service.update(5, { name: '  Renamed ', description: null })).resolves.toMatchObject({
        name: 'Renamed',
        description: null,
        enabled: true,
      });
      await expect(service.create({ name: ' New ', description: '  ' })).resolves.toMatchObject({
        name: 'New',
        description: null,
        enabled: true,
        scope: 'global',
      });
    });
  });

  it('passes the global flow context to resolveConfigSchema, with purpose for previews', async () => {
    const schema = { type: 'object', properties: { channelId: { type: 'string' } } };
    const resolve = jest.fn().mockResolvedValue(schema);
    registerPluginFlowNodes('context-test', [
      {
        type: 'plugin.context-test.dynamic',
        label: 'Dynamic',
        inputs: ['input'],
        outputs: [],
        isOutput: true,
        flowScopes: ['resource', 'global'],
        resolveConfigSchema: resolve,
        execute: jest.fn(),
      },
    ]);
    await expect(service.resolveNodeSchema(5, 'plugin.context-test.dynamic', { a: 1 })).resolves.toMatchObject({
      configSchema: schema,
    });
    expect(resolve).toHaveBeenLastCalledWith({ a: 1 }, { flowScope: 'global', resourceId: null, flowId: 5 });
    await service.resolveNodeSchema(5, 'plugin.context-test.dynamic', { a: 2 }, 'preview');
    expect(resolve).toHaveBeenLastCalledWith(
      { a: 2 },
      { flowScope: 'global', resourceId: null, flowId: 5, purpose: 'preview' },
    );
  });

  it('reports a missing flow', async () => {
    flowRepository.findOne.mockResolvedValue(null);
    await expect(service.getCanvas(99)).rejects.toThrow(NotFoundException);
    await expect(service.delete(99)).rejects.toThrow(NotFoundException);
  });

  it('deletes the flow row only: nodes and edges go by cascade', async () => {
    nodeRepository.find.mockResolvedValue([]);
    edgeRepository.find.mockResolvedValue([]);
    await service.delete(5, testActor);
    expect(flowRepository.delete).toHaveBeenCalledWith({ id: 5 });
  });

  it('refuses to resolve a resource-only plugin node for a global flow', async () => {
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

// Several real SQLite schema syncs; coverage runs on loaded CI machines exceed Jest's 5 s default.
describe('GlobalFlowsService with a database', () => {
  jest.setTimeout(30_000);
  let db: Awaited<ReturnType<typeof openFlowCanvasDatabase>>;
  beforeEach(async () => {
    db = await openFlowCanvasDatabase();
  });
  afterEach(() => db.source.destroy());

  const owners = async () =>
    (await db.nodes.find({ order: { id: 'ASC' } })).map(({ id, resourceId, flowId }) => ({ id, resourceId, flowId }));

  it('rejects ids of a resource flow with 400 naming them and leaves both flows untouched', async () => {
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);

    const saving = db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('r'), testActor);
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    await expect(saving).rejects.toMatchObject({
      response: { nodeIds: expect.arrayContaining(['r-start', 'r-http']), edgeIds: ['r-edge'] },
    });
    expect(await owners()).toEqual([
      // The failed save rolled back: the global flow keeps its nodes.
      { id: 'g-http', resourceId: null, flowId: db.flow.id },
      { id: 'g-start', resourceId: null, flowId: db.flow.id },
      { id: 'r-http', resourceId: db.resource.id, flowId: null },
      { id: 'r-start', resourceId: db.resource.id, flowId: null },
    ]);
    expect(await db.edges.findOneByOrFail({ id: 'r-edge' })).toMatchObject({
      resourceId: db.resource.id,
      flowId: null,
    });
  });

  it('rejects ids of another global flow and saves its own ids again', async () => {
    const other = await db.flows.save(db.flows.create({ name: 'Other', enabled: true, scope: 'global' }));
    await db.globalFlows.saveCanvas(other.id, startToHttpCanvas('o'), testActor);
    await expect(db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('o'), testActor)).rejects.toMatchObject({
      response: { edgeIds: ['o-edge'] },
    });
    expect(await db.nodes.count({ where: { flowId: other.id } })).toBe(2);

    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    await expect(db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor)).resolves.toMatchObject({
      nodes: [{ id: 'g-start' }, { id: 'g-http' }],
    });
  });

  it('enforces exactly one owner per node and edge in the schema', async () => {
    const base = { type: T.INPUT_RESOURCE_USAGE_STARTED, position: { x: 0, y: 0 }, data: {} };
    await expect(db.nodes.insert({ ...base, id: 'none', resourceId: null, flowId: null })).rejects.toThrow(
      /CHECK constraint failed/,
    );
    await expect(
      db.nodes.insert({ ...base, id: 'both', resourceId: db.resource.id, flowId: db.flow.id }),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      db.edges.insert({ id: 'none', source: 'a', target: 'b', resourceId: null, flowId: null }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('does not list, count or open flows of another scope', async () => {
    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    // A future flow scope (ATT-1204) sharing the table.
    const foreign = await db.flows.save(db.flows.create({ name: 'Resource scoped', scope: 'resource' }));
    await db.nodes.insert({
      id: 'foreign-node',
      type: T.INPUT_RESOURCE_USAGE_STARTED,
      position: { x: 0, y: 0 },
      data: {},
      flowId: foreign.id,
      resourceId: null,
    });

    await expect(db.globalFlows.list()).resolves.toEqual([
      expect.objectContaining({ id: db.flow.id, nodeCount: 2, scope: 'global' }),
    ]);
    await expect(db.globalFlows.get(foreign.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(db.globalFlows.getCanvas(foreign.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(db.globalFlows.update(foreign.id, { enabled: false })).rejects.toBeInstanceOf(NotFoundException);
    await expect(db.globalFlows.delete(foreign.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
