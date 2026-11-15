import {
  AuditLog,
  entities,
  Flow,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  ResourceType,
  Setting,
} from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { createTestAuditMetrics } from '../../audit/audit.test-fixture';
import { auditActorOf } from '../../audit/recorder/audit-event';
import * as migrations from '../../database/migrations';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { ResourceFlowSaveDto } from './dto/index';
import { startToHttpCanvas, testActor } from './flow-canvas-database.test-fixture';
import { GlobalFlowsService } from './global-flows.service';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowVariablesService } from './variables/resource-flow-variables.service';

const T = ResourceFlowNodeType;
const tokenActor = auditActorOf({ id: 3, authenticationMethod: 'api-token', apiTokenId: 12 });

/** A chain of HTTP requests whose data alone is far above the audit limit. */
function largeCanvas(nodeCount: number): ResourceFlowSaveDto {
  return {
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `big-${i}`,
      type: T.OUTPUT_HTTP_SEND_REQUEST,
      position: { x: i * 10, y: 0 },
      data: { url: `https://example.com/${'p'.repeat(500)}`, method: 'POST' },
    })),
    edges: Array.from({ length: nodeCount - 1 }, (_, i) => ({
      id: `big-edge-${i}`,
      source: `big-${i}`,
      sourceHandle: 'output',
      target: `big-${i + 1}`,
      targetHandle: 'input',
    })),
  };
}

/**
 * The flow services against a migrated SQLite database and the real audit storage: rows are written by AuditService
 * through the caller's transaction (canvas saves, flow deletion) or its own connection, and read back as stored.
 */
describe('flow audit rows in migrated storage', () => {
  jest.setTimeout(60_000);
  let directory: string;
  let source: DataSource;
  let audit: AuditService;
  let resourceFlows: ResourceFlowsService;
  let globalFlows: GlobalFlowsService;
  let variables: ResourceFlowVariablesService;
  let resource: Resource;
  let flow: Flow;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'flow-audit-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'flow-audit.sqlite'),
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    const store = new SettingsStoreService(source.getRepository(Setting), null);
    await store.setPlainSetting('audit', 'domains', JSON.stringify(['resource']));
    audit = new AuditService(source, store, createTestAuditMetrics());
    await audit.onModuleInit();
    const [nodes, edges, flows] = [ResourceFlowNode, ResourceFlowEdge, Flow].map((entity) =>
      source.getRepository(entity),
    );
    resourceFlows = new ResourceFlowsService(
      nodes as never,
      edges as never,
      source.getRepository(Resource),
      { subscribe: jest.fn().mockResolvedValue(undefined) } as never,
      new EventEmitter2(),
      flows as never,
      audit,
    );
    globalFlows = new GlobalFlowsService(flows as never, nodes as never, edges as never, resourceFlows, audit);
    variables = new ResourceFlowVariablesService(
      source.getRepository(ResourceFlowVariable),
      new EventEmitter2(),
      audit,
    );
  });

  afterAll(async () => {
    await audit?.onModuleDestroy();
    if (source?.isInitialized) await source.destroy();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await source.getRepository(AuditLog).clear();
    const resources = source.getRepository(Resource);
    resource = await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine }));
    const flows = source.getRepository(Flow);
    flow = await flows.save(flows.create({ name: 'Notify', enabled: true, scope: 'global' }));
  });

  afterEach(() => jest.restoreAllMocks());

  const rows = () => source.getRepository(AuditLog).find({ order: { id: 'ASC' } });
  const storedSizes = async () =>
    (await source.query('SELECT length(CAST("details" AS BLOB)) AS size FROM "audit_log" ORDER BY "id"')).map(
      ({ size }: { size: number }) => size,
    );
  const resourceNodeIds = async () =>
    (
      await source.getRepository(ResourceFlowNode).find({ where: { resourceId: resource.id }, order: { id: 'ASC' } })
    ).map(({ id }) => id);

  describe('resource flow canvas', () => {
    it('stores a 200-node canvas and then its removal, with the actor and bounded details', async () => {
      await resourceFlows.saveResourceFlow(resource.id, largeCanvas(200), tokenActor);
      await resourceFlows.saveResourceFlow(resource.id, { nodes: [], edges: [] }, testActor);

      const [added, emptied] = await rows();
      expect(added).toMatchObject({
        domain: 'resource',
        action: 'resource_flow.updated',
        actorId: 3,
        authenticationMethod: 'api-token',
        apiTokenId: 12,
        subjectType: 'resource',
        subjectId: resource.id,
        outcome: 'succeeded',
        details: expect.objectContaining({ 'after.nodeCount': 200, addedNodeCount: 200, addedEdgeCount: 199 }),
      });
      expect(emptied).toMatchObject({
        action: 'resource_flow.updated',
        actorId: 7,
        authenticationMethod: 'session',
        apiTokenId: null,
        subjectType: 'resource',
        subjectId: resource.id,
        details: expect.objectContaining({
          'before.nodeCount': 200,
          'before.edgeCount': 199,
          'after.nodeCount': 0,
          removedNodeCount: 200,
          removedEdgeCount: 199,
          snapshotDetail: 'omitted',
        }),
      });
      expect(JSON.parse(emptied.details.removedNodes as string).length).toBeLessThan(200);
      for (const size of await storedSizes()) expect(size).toBeLessThanOrEqual(4096);
      expect(await resourceNodeIds()).toEqual([]);
    });

    it('stores a rebuildable snapshot when a small canvas is emptied', async () => {
      await resourceFlows.saveResourceFlow(resource.id, startToHttpCanvas('r'), testActor);
      await resourceFlows.saveResourceFlow(resource.id, { nodes: [], edges: [] }, testActor);

      const emptied = (await rows())[1];
      expect(emptied.details.snapshotDetail).toBe('full');
      const snapshot = JSON.parse(emptied.details['before.snapshot'] as string);
      expect(snapshot.nodes.map((node: { id: string }) => node.id).sort()).toEqual(['r-http', 'r-start']);
      expect(snapshot.edges).toEqual([
        { id: 'r-edge', source: 'r-start', target: 'r-http', sourceHandle: 'output', targetHandle: 'input' },
      ]);
    });

    it('stores nothing for a save that does not change the canvas', async () => {
      await resourceFlows.saveResourceFlow(resource.id, startToHttpCanvas('r'), testActor);
      await resourceFlows.saveResourceFlow(resource.id, startToHttpCanvas('r'), testActor);
      expect(await rows()).toHaveLength(1);
    });

    it('stores no row and keeps the canvas when the ids belong to another flow', async () => {
      await globalFlows.saveCanvas(flow.id, startToHttpCanvas(`g${flow.id}`), testActor);
      await resourceFlows.saveResourceFlow(resource.id, startToHttpCanvas(`r${resource.id}`), testActor);
      const before = await rows();

      await expect(
        resourceFlows.saveResourceFlow(resource.id, startToHttpCanvas(`g${flow.id}`), testActor),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await rows()).toEqual(before);
      expect(await resourceNodeIds()).toEqual([`r${resource.id}-http`, `r${resource.id}-start`]);
    });

    it('rolls the recorded row back with the canvas when a later step of the save fails', async () => {
      await resourceFlows.saveResourceFlow(resource.id, startToHttpCanvas(`r${resource.id}`), testActor);
      const before = await rows();
      const record = jest.spyOn(audit, 'record');
      const transaction = source.manager.transaction.bind(source.manager);
      jest.spyOn(source.manager, 'transaction').mockImplementationOnce(((work: never) =>
        transaction(async (manager) => {
          await (work as (manager: unknown) => Promise<unknown>)(manager);
          throw new Error('later step failed');
        })) as never);

      await expect(resourceFlows.saveResourceFlow(resource.id, { nodes: [], edges: [] }, testActor)).rejects.toThrow(
        'later step failed',
      );

      // The row was written inside the transaction, then rolled back with it.
      await expect(record.mock.results[0].value).resolves.toEqual({ status: 'recorded' });
      expect(await rows()).toEqual(before);
      expect(await resourceNodeIds()).toEqual([`r${resource.id}-http`, `r${resource.id}-start`]);
    });
  });

  describe('global flows', () => {
    const flowRow = (action: string, subjectId: number, details: object) => ({
      domain: 'resource',
      action,
      actorId: 7,
      authenticationMethod: 'session',
      subjectType: 'flow',
      subjectId,
      details: expect.objectContaining(details),
    });

    it('stores create, update, canvas save and delete with the flow subject and name', async () => {
      const created = await globalFlows.create({ name: 'Door bell', description: 'rings' }, testActor);
      await globalFlows.update(created.id, { name: 'Door chime' }, testActor);
      await globalFlows.saveCanvas(created.id, startToHttpCanvas(`d${created.id}`), testActor);
      await globalFlows.delete(created.id, testActor);

      const stored = await rows();
      expect(stored).toEqual([
        expect.objectContaining(
          flowRow('flow.created', created.id, { 'after.name': 'Door bell', 'after.description': 'rings' }),
        ),
        expect.objectContaining(
          flowRow('flow.updated', created.id, {
            flowName: 'Door chime',
            'before.name': 'Door bell',
            'after.name': 'Door chime',
            changedFields: '["name"]',
          }),
        ),
        expect.objectContaining(
          flowRow('flow.canvas_updated', created.id, { flowName: 'Door chime', 'after.nodeCount': 2 }),
        ),
        expect.objectContaining(
          flowRow('flow.deleted', created.id, {
            'before.name': 'Door chime',
            'before.enabled': 1,
            'before.nodeCount': 2,
            'before.edgeCount': 1,
            snapshotDetail: 'full',
          }),
        ),
      ]);
      const snapshot = JSON.parse(stored[3].details['before.snapshot'] as string);
      expect(snapshot.nodes.map((node: { id: string }) => node.id).sort()).toEqual([
        `d${created.id}-http`,
        `d${created.id}-start`,
      ]);
      // The canvas went with the flow.
      expect(await source.getRepository(ResourceFlowNode).count({ where: { flowId: created.id } })).toBe(0);
    });
  });

  describe('flow variables', () => {
    const { RESOURCE, GLOBAL } = ResourceFlowVariableScope;
    const variableRow = (action: string, details: object) =>
      expect.objectContaining({
        domain: 'resource',
        action,
        actorId: 7,
        subjectType: 'resource',
        subjectId: resource.id,
        details: expect.objectContaining(details),
      });
    const storedVariables = (scope: ResourceFlowVariableScope) =>
      source.getRepository(ResourceFlowVariable).find({ where: { scope } });

    it('stores a resource variable set and delete, and nothing for an unchanged set or a missing key', async () => {
      await variables.set(RESOURCE, resource.id, 'mode', 'on', resource.id, null, testActor);
      await variables.set(RESOURCE, resource.id, 'mode', 'on', resource.id, null, testActor);
      await variables.delete(RESOURCE, resource.id, 'mode', testActor);
      await variables.delete(RESOURCE, resource.id, 'mode', testActor);

      expect(await rows()).toEqual([
        variableRow('flow_variable.set', { scope: 'resource', key: 'mode', 'after.value': '"on"' }),
        variableRow('flow_variable.deleted', { scope: 'resource', key: 'mode', 'before.value': '"on"' }),
      ]);
    });

    it('deletes a global variable and stores one row, and nothing for a missing key', async () => {
      const key = `threshold-${resource.id}`;
      await variables.set(GLOBAL, resource.id, key, 5, resource.id, null, testActor);
      await variables.set(GLOBAL, resource.id, key, 5, resource.id, null, testActor);
      expect((await storedVariables(GLOBAL)).filter((row) => row.key === key)).toEqual([
        expect.objectContaining({ resourceId: null }),
      ]);

      await variables.delete(GLOBAL, resource.id, key, testActor);
      await variables.delete(GLOBAL, resource.id, key, testActor);

      expect((await storedVariables(GLOBAL)).filter((row) => row.key === key)).toEqual([]);
      expect(await rows()).toEqual([
        variableRow('flow_variable.set', { scope: 'global', key, 'after.value': '5' }),
        variableRow('flow_variable.deleted', { scope: 'global', key, 'before.value': '5' }),
      ]);
    });

    it('stores nothing for a write by a flow (no actor)', async () => {
      await variables.set(RESOURCE, resource.id, 'counter', 1, resource.id, flow.id);
      await variables.delete(RESOURCE, resource.id, 'counter');
      expect(await rows()).toEqual([]);
    });
  });
});
