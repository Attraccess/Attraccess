import { Resource, ResourceMeter, ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { ResourceFlowNodeType, ResourceFlowVariableScope, ResourceType } from '@attraccess/application-models';
import type { FlowCanvasInput } from '@attraccess/application-models';
import type { AuditEvent } from '../../../audit/recorder/audit-event';
import { FlowCanvasIdConflictError } from '../../../resources/flows/flow-graph.port';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TypeOrmFlowGraphStore } from './typeorm-flow-graph.store';
import { TypeOrmFlowResourceDirectory } from './typeorm-flow-resource-directory';
import { TypeOrmFlowVariableStore } from './typeorm-flow-variable.store';

jest.setTimeout(30_000);

const canvas = (prefix: string, count = 2): FlowCanvasInput => ({
  nodes: Array.from({ length: count }, (_unused, index) => ({
    id: `${prefix}-n${index}`,
    type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    position: { x: index, y: 2 * index },
    data: { index },
  })),
  edges:
    count > 1
      ? [
          {
            id: `${prefix}-e0`,
            source: `${prefix}-n0`,
            sourceHandle: 'out',
            target: `${prefix}-n1`,
            targetHandle: null,
          },
        ]
      : [],
});

const event = (id: number): AuditEvent => ({
  domain: 'resource',
  action: 'resource_flow.updated',
  actor: { id: 1, authenticationMethod: 'session' },
  subject: { type: 'resource', id },
  details: {},
});

describe('flow adapters on real SQLite', () => {
  let fixture: SqliteFileFixture;
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    fixture = await SqliteFileFixture.create();
    audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  });

  afterEach(async () => {
    await fixture.close();
  });

  const instance = async (createSchema = false) => {
    const source = await fixture.open(createSchema);
    const graph = new TypeOrmFlowGraphStore(source, unitOfWorkFor(source), audit as never);
    return { source, graph };
  };

  const newResource = async (source: Awaited<ReturnType<typeof instance>>['source'], name: string) => {
    const resources = source.getRepository(Resource);
    return (await resources.save(resources.create({ name, type: ResourceType.Machine }))).id;
  };

  describe('flow graph store', () => {
    it('replaces a canvas and returns the previous and the saved records', async () => {
      const { source, graph } = await instance();
      const resourceId = await newResource(source, 'Laser');

      const first = await graph.replaceResourceCanvas(resourceId, canvas('a'), () => undefined);
      expect(first.previous).toEqual({ nodes: [], edges: [] });
      expect(first.saved.nodes.map((node) => node.id).sort()).toEqual(['a-n0', 'a-n1']);
      expect(first.saved.nodes[0]).toEqual(
        expect.objectContaining({ resourceId, flowId: null, position: expect.any(Object) }),
      );
      expect(Object.keys(first.saved.nodes[0]).sort()).toEqual(
        ['createdAt', 'data', 'flowId', 'id', 'position', 'resourceId', 'type', 'updatedAt'].sort(),
      );
      expect(first.saved.edges[0]).toEqual(
        expect.objectContaining({ id: 'a-e0', source: 'a-n0', sourceHandle: 'out', targetHandle: null, resourceId }),
      );

      const second = await graph.replaceResourceCanvas(resourceId, canvas('b', 1), () => undefined);
      expect(second.previous.nodes.map((node) => node.id).sort()).toEqual(['a-n0', 'a-n1']);
      expect(await graph.loadResourceCanvas(resourceId)).toEqual({
        nodes: [expect.objectContaining({ id: 'b-n0', data: { index: 0 } })],
        edges: [],
      });
    });

    it('records the audit event inside the transaction of the canvas write and builds it from the previous canvas', async () => {
      const { source, graph } = await instance();
      const resourceId = await newResource(source, 'Laser');
      await graph.replaceResourceCanvas(resourceId, canvas('a'), () => undefined);
      const seen: boolean[] = [];
      audit.record.mockImplementationOnce(
        async (_event: AuditEvent, manager: { queryRunner?: { isTransactionActive: boolean } }) => {
          seen.push(manager?.queryRunner?.isTransactionActive === true);
          return { status: 'recorded' };
        },
      );

      await graph.replaceResourceCanvas(resourceId, canvas('b'), (previous) => {
        expect(previous.nodes).toHaveLength(2);
        return event(resourceId);
      });

      expect(seen).toEqual([true]);
    });

    it('rolls the canvas back with a failing audit write', async () => {
      const { source, graph } = await instance();
      const resourceId = await newResource(source, 'Laser');
      await graph.replaceResourceCanvas(resourceId, canvas('a'), () => undefined);
      audit.record.mockRejectedValueOnce(new Error('audit down'));

      await expect(graph.replaceResourceCanvas(resourceId, canvas('b'), () => event(resourceId))).rejects.toThrow(
        'audit down',
      );

      const kept = await graph.loadResourceCanvas(resourceId);
      expect(kept.nodes.map((node) => node.id).sort()).toEqual(['a-n0', 'a-n1']);
      expect(kept.edges.map((edge) => edge.id)).toEqual(['a-e0']);
    });

    it('rejects ids that another flow owns and keeps the previous canvas', async () => {
      const { source, graph } = await instance();
      const laser = await newResource(source, 'Laser');
      const drill = await newResource(source, 'Drill');
      await graph.replaceResourceCanvas(laser, canvas('laser'), () => undefined);
      await graph.replaceResourceCanvas(drill, canvas('drill'), () => undefined);

      const stolen = canvas('laser');
      stolen.nodes[0].id = 'drill-n0';
      stolen.edges[0].id = 'drill-e0';
      const error = await graph.replaceResourceCanvas(laser, stolen, () => undefined).catch((caught) => caught);

      expect(error).toBeInstanceOf(FlowCanvasIdConflictError);
      expect(error.nodeIds).toEqual(['drill-n0']);
      expect(error.edgeIds).toEqual(['drill-e0']);
      expect((await graph.loadResourceCanvas(laser)).nodes.map((node) => node.id).sort()).toEqual([
        'laser-n0',
        'laser-n1',
      ]);
      expect((await graph.loadResourceCanvas(drill)).nodes).toHaveLength(2);
    });

    it('leaves exactly one of two canvases when two connections replace the same canvas concurrently', async () => {
      const a = await instance(true);
      const b = await instance();
      const resourceId = await newResource(a.source, 'Laser');

      const results = await Promise.allSettled([
        a.graph.replaceResourceCanvas(resourceId, canvas('a', 3), () => undefined),
        b.graph.replaceResourceCanvas(resourceId, canvas('b', 3), () => undefined),
      ]);

      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
      const ids = (await a.graph.loadResourceCanvas(resourceId)).nodes.map((node) => node.id).sort();
      expect([
        ['a-n0', 'a-n1', 'a-n2'],
        ['b-n0', 'b-n1', 'b-n2'],
      ]).toContainEqual(ids);
      const edges = (await b.graph.loadResourceCanvas(resourceId)).edges.map((edge) => edge.id);
      expect(edges).toEqual([ids[0].startsWith('a') ? 'a-e0' : 'b-e0']);
    });

    it('manages global flows: create, update, list with node counts, delete with the canvas in the audit event', async () => {
      const { graph } = await instance();
      const flow = await graph.createGlobalFlow({ name: 'Notify', description: null, enabled: true });
      const other = await graph.createGlobalFlow({ name: 'Another', description: 'text', enabled: false });
      expect(flow).toEqual(
        expect.objectContaining({ name: 'Notify', description: null, enabled: true, scope: 'global' }),
      );

      const updated = await graph.updateGlobalFlow({ ...flow, name: 'Notify v2', enabled: false });
      expect(updated).toEqual(expect.objectContaining({ id: flow.id, name: 'Notify v2', enabled: false }));
      expect(await graph.findGlobalFlow(flow.id)).toEqual(expect.objectContaining({ name: 'Notify v2' }));
      expect(await graph.findGlobalFlow(9999)).toBeNull();

      await graph.replaceGlobalCanvas(flow.id, canvas('g'), () => undefined);
      expect((await graph.listGlobalFlows()).map((summary) => [summary.name, summary.nodeCount])).toEqual([
        ['Another', 0],
        ['Notify v2', 2],
      ]);
      expect((await graph.loadGlobalCanvas(flow.id)).nodes.every((node) => node.flowId === flow.id)).toBe(true);
      expect(await graph.findGlobalFlowNodes(flow.id)).toHaveLength(2);
      expect(await graph.loadEnabledGlobalCanvases()).toEqual([]);

      let audited: unknown;
      const deleted = await graph.deleteGlobalFlow(flow.id, (deletedCanvas) => {
        audited = deletedCanvas;
        return event(flow.id);
      });
      expect(deleted).toBe(true);
      expect((audited as { nodes: unknown[] }).nodes).toHaveLength(2);
      expect(await graph.deleteGlobalFlow(flow.id, () => event(flow.id))).toBe(false);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(await graph.findGlobalFlow(other.id)).not.toBeNull();
    });

    it('loads enabled global flows with their own canvases, lowest id first', async () => {
      const { graph } = await instance();
      const first = await graph.createGlobalFlow({ name: 'One', description: null, enabled: true });
      const second = await graph.createGlobalFlow({ name: 'Two', description: null, enabled: true });
      await graph.createGlobalFlow({ name: 'Off', description: null, enabled: false });
      await graph.replaceGlobalCanvas(first.id, canvas('one'), () => undefined);
      await graph.replaceGlobalCanvas(second.id, canvas('two', 1), () => undefined);

      const loaded = await graph.loadEnabledGlobalCanvases();

      expect(loaded.map(({ flow, canvas: own }) => [flow.name, own.nodes.length, own.edges.length])).toEqual([
        ['One', 2, 1],
        ['Two', 1, 0],
      ]);
    });

    it('finds nodes by type for one resource or several', async () => {
      const { source, graph } = await instance();
      const laser = await newResource(source, 'Laser');
      const drill = await newResource(source, 'Drill');
      await graph.replaceResourceCanvas(laser, canvas('laser'), () => undefined);
      await graph.replaceResourceCanvas(drill, canvas('drill', 1), () => undefined);
      const type = ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED;

      expect((await graph.findResourceNodes(laser, type)).map((node) => node.id).sort()).toEqual([
        'laser-n0',
        'laser-n1',
      ]);
      expect((await graph.findNodesForResources([laser, drill], type)).map((node) => node.resourceId).sort()).toEqual(
        [laser, laser, drill].sort(),
      );
      expect(await graph.findNodesForResources([], type)).toEqual([]);
      expect(await source.getRepository(ResourceFlowEdge).count()).toBe(1);
    });
  });

  describe('flow variable store', () => {
    it('stores global and resource variables, finds them by key and deletes them', async () => {
      const { source } = await instance();
      const resourceId = await newResource(source, 'Laser');
      const store = new TypeOrmFlowVariableStore(source);
      const global = { scope: ResourceFlowVariableScope.GLOBAL, resourceId: null, key: 'mode' };
      const own = { scope: ResourceFlowVariableScope.RESOURCE, resourceId, key: 'count' };

      const created = await store.save(global, '"day"', 'string', null);
      await store.save(own, '3', 'number', null);
      expect(await store.find(global)).toEqual(created);
      expect(created).toEqual(expect.objectContaining({ id: expect.any(Number), value: '"day"', valueType: 'string' }));

      const updated = await store.save(global, '"night"', 'string', created);
      expect(updated.id).toBe(created.id);
      expect((await store.find(global))?.value).toBe('"night"');

      expect((await store.findVisibleTo(resourceId)).map((row) => row.key).sort()).toEqual(['count', 'mode']);
      expect((await store.findVisibleTo(null)).map((row) => row.key)).toEqual(['mode']);
      expect((await store.listForResource(resourceId)).map((row) => row.scope)).toEqual([
        ResourceFlowVariableScope.GLOBAL,
        ResourceFlowVariableScope.RESOURCE,
      ]);
      expect(
        (await store.findMany(ResourceFlowVariableScope.GLOBAL, null, ['mode', 'missing'])).map((row) => row.key),
      ).toEqual(['mode']);

      expect(await store.delete(global)).toBe(true);
      expect(await store.delete(global)).toBe(false);
      expect(await store.find(global)).toBeNull();
      expect(await store.find(own)).not.toBeNull();
    });
  });

  describe('flow resource directory', () => {
    it('reads resources and the meter ids of a resource', async () => {
      const { source } = await instance();
      const resourceId = await newResource(source, 'Laser');
      const directory = new TypeOrmFlowResourceDirectory(source);
      const meters = source.getRepository(ResourceMeter);
      const meter = await meters.save(meters.create({ resourceId, name: 'Energy', unit: 'kWh' } as ResourceMeter));

      expect(await directory.find(resourceId)).toEqual({
        id: resourceId,
        name: 'Laser',
        type: ResourceType.Machine,
        metadata: null,
      });
      expect(await directory.find(404)).toBeNull();
      expect(await directory.meterIds(resourceId)).toEqual([meter.id]);
      expect(await directory.meterIds(404)).toEqual([]);
      expect(await source.getRepository(ResourceFlowNode).count()).toBe(0);
    });
  });
});
