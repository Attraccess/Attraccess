import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FlowRecord, ResourceFlowNodeType } from '@attraccess/application-models';
import type { FlowCanvas } from './flow-graph.port';
import type { AuditActor, AuditEvent } from '../../audit/recorder/audit-event';
import { GlobalFlowsService } from './global-flows.service';
import { ResourceFlowsService } from './resource-flows.service';
import { getCoreNodeFlowScopes } from './schemas/core-node-schemas';
import { getNodeFlowScopes } from './schemas/node-flow-scopes';
import { registerPluginFlowNodes } from '../../plugin-system/flows/node-registry';

const T = ResourceFlowNodeType;
const testActor: AuditActor = { id: 7, authenticationMethod: 'session' };

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
  const flow: FlowRecord = {
    id: 5,
    name: 'Notify',
    description: null,
    enabled: true,
    scope: 'global',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const timestamps = { createdAt: new Date(0), updatedAt: new Date(0) };
  const emptyCanvas: FlowCanvas = { nodes: [], edges: [] };

  /** A fake store: replace* mimics the atomic unit (audit factory first fails => nothing saved or recorded). */
  const graph = {
    findGlobalFlow: jest.fn(),
    createGlobalFlow: jest.fn(),
    updateGlobalFlow: jest.fn(),
    listGlobalFlows: jest.fn(),
    findGlobalFlowNodes: jest.fn(),
    loadGlobalCanvas: jest.fn(),
    replaceGlobalCanvas: jest.fn(),
    deleteGlobalFlow: jest.fn(),
  };
  const subscribe = jest.fn();
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const resourceFlows = new ResourceFlowsService(
    {} as never,
    {} as never,
    { subscribe: subscribe.mockResolvedValue(undefined) } as never,
    { emit: jest.fn() } as never,
    audit as never,
  );
  const service = new GlobalFlowsService(graph as never, resourceFlows, audit as never);

  const position = { x: 0, y: 0 };

  beforeEach(() => {
    jest.clearAllMocks();
    flow.enabled = true;
    graph.findGlobalFlow.mockImplementation(async () => ({ ...flow }));
    graph.createGlobalFlow.mockImplementation(async (draft) => ({ ...flow, id: 6, ...draft, scope: 'global' }));
    graph.updateGlobalFlow.mockImplementation(async (row) => row);
    graph.findGlobalFlowNodes.mockResolvedValue([]);
    graph.deleteGlobalFlow.mockImplementation(async (_id: number, factory: (c: FlowCanvas) => AuditEvent) => {
      await audit.record(factory(emptyCanvas));
      return true;
    });
    // Like the real store: the audit row is built from the replaced canvas and recorded with the write.
    graph.replaceGlobalCanvas.mockImplementation(
      async (
        flowId: number,
        canvas: { nodes: { data?: object }[]; edges: object[] },
        factory: (c: FlowCanvas) => AuditEvent | undefined,
      ) => {
        const event = factory(emptyCanvas);
        if (event) await audit.record(event);
        return {
          previous: emptyCanvas,
          saved: {
            nodes: canvas.nodes.map((n) => ({ ...n, data: n.data ?? {}, ...timestamps, resourceId: null, flowId })),
            edges: canvas.edges.map((e) => ({ ...e, ...timestamps, resourceId: null, flowId })),
          },
        };
      },
    );
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

    expect(graph.replaceGlobalCanvas).toHaveBeenCalledWith(5, expect.anything(), expect.any(Function));
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
    expect(graph.replaceGlobalCanvas).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects an edge whose source is not on the canvas and names it', async () => {
    await expect(
      service.saveCanvas(
        5,
        {
          nodes: [{ id: 'ok', type: T.INPUT_RESOURCE_USAGE_STARTED, position, data: {} }],
          edges: [{ id: 'gone', source: 'deleted', target: 'ok', sourceHandle: null, targetHandle: null }],
        },
        testActor,
      ),
    ).rejects.toMatchObject({
      response: {
        message: [expect.stringContaining('gone')],
        edges: [{ edgeId: 'gone', source: 'deleted', target: 'ok' }],
      },
    });
    expect(graph.replaceGlobalCanvas).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records nothing when the database rejects a canvas save', async () => {
    graph.replaceGlobalCanvas.mockRejectedValueOnce(new Error('database rejected write'));
    await expect(
      service.saveCanvas(
        5,
        { nodes: [{ id: 'a', type: T.INPUT_RESOURCE_USAGE_STARTED, position, data: {} }], edges: [] },
        testActor,
      ),
    ).rejects.toThrow('database rejected write');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records nothing when the database rejects a create, an update or a delete', async () => {
    graph.createGlobalFlow.mockRejectedValueOnce(new Error('database rejected write'));
    await expect(service.create({ name: 'New' }, testActor)).rejects.toThrow('database rejected write');
    graph.updateGlobalFlow.mockRejectedValueOnce(new Error('database rejected write'));
    await expect(service.update(5, { name: 'Renamed' }, testActor)).rejects.toThrow('database rejected write');
    graph.deleteGlobalFlow.mockRejectedValueOnce(new Error('database rejected delete'));
    await expect(service.delete(5, testActor)).rejects.toThrow('database rejected delete');
    expect(audit.record).not.toHaveBeenCalled();
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
    graph.findGlobalFlowNodes.mockResolvedValue([{ ...mqtt, flowId: 5 }]);
    await service.update(5, { enabled: true }, testActor);
    expect(subscribe).toHaveBeenCalledWith(2, 'a/b');
  });

  it('only looks up flows of the global scope', async () => {
    await service.get(5);
    expect(graph.findGlobalFlow).toHaveBeenCalledWith(5);
  });

  describe('name, description and enabled', () => {
    it('rejects a null or blank name and a null enabled with 400 and saves nothing', async () => {
      for (const dto of [{ name: null }, { name: '   ' }, { enabled: null }]) {
        await expect(service.update(5, dto as never, testActor)).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(service.create({ name: '  ' }, testActor)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(5, { enabled: 'yes' } as never, testActor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(graph.createGlobalFlow).not.toHaveBeenCalled();
      expect(graph.updateGlobalFlow).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('trims the name and clears the description with null', async () => {
      graph.findGlobalFlow.mockResolvedValue({ ...flow, description: 'old' });
      await expect(service.update(5, { name: '  Renamed ', description: null }, testActor)).resolves.toMatchObject({
        name: 'Renamed',
        description: null,
        enabled: true,
      });
      await expect(service.create({ name: ' New ', description: '  ' }, testActor)).resolves.toMatchObject({
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
    graph.findGlobalFlow.mockResolvedValue(null);
    await expect(service.getCanvas(99)).rejects.toThrow(NotFoundException);
    await expect(service.delete(99, testActor)).rejects.toThrow(NotFoundException);
    await expect(service.update(99, { name: 'Renamed' }, testActor)).rejects.toThrow(NotFoundException);
    await expect(service.delete(99, testActor)).rejects.toThrow(NotFoundException);
    await expect(service.saveCanvas(99, { nodes: [], edges: [] }, testActor)).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('deletes the flow with an audit event built from the canvas the store read', async () => {
    await service.delete(5, testActor);
    expect(graph.deleteGlobalFlow).toHaveBeenCalledWith(5, expect.any(Function));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'flow.deleted' }));
  });

  it('records nothing when a concurrent delete removed the flow first', async () => {
    graph.deleteGlobalFlow.mockResolvedValueOnce(false);
    await service.delete(5, testActor);
    expect(audit.record).not.toHaveBeenCalled();
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
