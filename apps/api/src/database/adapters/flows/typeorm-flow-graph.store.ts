import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Flow, ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import type { FlowCanvasInput, FlowRecord, FlowNodeRecord, ResourceFlowNodeType } from '@attraccess/application-models';
import { AUDIT_RECORDER, type AuditEvent, type AuditRecorder } from '../../../audit/recorder/audit-event';
import {
  FlowCanvasIdConflictError,
  type CanvasAuditFactory,
  type FlowCanvas,
  type FlowGraphStore,
  type GlobalFlowDraft,
  type GlobalFlowSummary,
} from '../../../resources/flows/flow-graph.port';
import { ScopedUnitOfWork, TransactionScope, UNIT_OF_WORK } from '../../unit-of-work';
import { toEdgeRecord, toFlowRecord, toNodeRecord } from './flow-mappers';

type CanvasOwner = { resourceId: number } | { flowId: number };

const GLOBAL_SCOPE = { scope: 'global' } as const;

/** Advisory lock namespaces (first key of the two-key form) for the canvases of resources and of global flows. */
const RESOURCE_CANVAS_LOCK = 584_301;
const FLOW_CANVAS_LOCK = 584_302;

async function lockCanvasOwner(manager: EntityManager, owner: CanvasOwner): Promise<void> {
  const [namespace, id] =
    'resourceId' in owner ? [RESOURCE_CANVAS_LOCK, owner.resourceId] : [FLOW_CANVAS_LOCK, owner.flowId];
  await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [namespace, id]);
}

const ownerColumns = (owner: CanvasOwner) => ({
  resourceId: 'resourceId' in owner ? owner.resourceId : null,
  flowId: 'flowId' in owner ? owner.flowId : null,
});

@Injectable()
export class TypeOrmFlowGraphStore implements FlowGraphStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  private get nodes() {
    return this.dataSource.getRepository(ResourceFlowNode);
  }

  private get edges() {
    return this.dataSource.getRepository(ResourceFlowEdge);
  }

  private get flows() {
    return this.dataSource.getRepository(Flow);
  }

  private async loadCanvas(manager: EntityManager, owner: CanvasOwner): Promise<FlowCanvas> {
    const [nodes, edges] = await Promise.all([
      manager.find(ResourceFlowNode, { where: owner }),
      manager.find(ResourceFlowEdge, { where: owner }),
    ]);
    return { nodes: nodes.map(toNodeRecord), edges: edges.map(toEdgeRecord) };
  }

  loadResourceCanvas(resourceId: number): Promise<FlowCanvas> {
    return this.loadCanvas(this.dataSource.manager, { resourceId });
  }

  loadGlobalCanvas(flowId: number): Promise<FlowCanvas> {
    return this.loadCanvas(this.dataSource.manager, { flowId });
  }

  async findResourceNodes(
    resourceId: number,
    type: ResourceFlowNodeType,
    scope?: TransactionScope,
  ): Promise<FlowNodeRecord[]> {
    const manager = scope ? this.unitOfWork.handleOf(scope) : this.dataSource.manager;
    return (await manager.find(ResourceFlowNode, { where: { resourceId, type } })).map(toNodeRecord);
  }

  async findNodesForResources(resourceIds: number[], type: ResourceFlowNodeType): Promise<FlowNodeRecord[]> {
    if (resourceIds.length === 0) return [];
    return (await this.nodes.find({ where: { resourceId: In(resourceIds), type } })).map(toNodeRecord);
  }

  async findGlobalFlowNodes(flowId: number): Promise<FlowNodeRecord[]> {
    return (await this.nodes.find({ where: { flowId } })).map(toNodeRecord);
  }

  async loadEnabledGlobalCanvases(
    scope?: TransactionScope,
    options: { edges?: boolean } = {},
  ): Promise<Array<{ flow: FlowRecord; canvas: FlowCanvas }>> {
    const manager = scope ? this.unitOfWork.handleOf(scope) : this.dataSource.manager;
    const flows = await manager.find(Flow, { where: { enabled: true, ...GLOBAL_SCOPE }, order: { id: 'ASC' } });
    if (flows.length === 0) return [];
    const flowIds = flows.map((flow) => flow.id);
    // One after the other: a transaction has a single connection.
    const nodes = await manager.find(ResourceFlowNode, { where: { flowId: In(flowIds) } });
    const edges =
      options.edges === false ? [] : await manager.find(ResourceFlowEdge, { where: { flowId: In(flowIds) } });
    return flows.map((flow) => ({
      flow: toFlowRecord(flow),
      canvas: {
        nodes: nodes.filter((node) => node.flowId === flow.id).map(toNodeRecord),
        edges: edges.filter((edge) => edge.flowId === flow.id).map(toEdgeRecord),
      },
    }));
  }

  /**
   * Node and edge ids are global. Called after deleting the saving flow's own rows: any id still present belongs
   * to another resource or global flow, and saving it would move it out of its owner.
   */
  private async assertIdsNotOwnedElsewhere(manager: EntityManager, canvas: FlowCanvasInput): Promise<void> {
    const nodeIds = canvas.nodes.map((node) => node.id);
    const edgeIds = canvas.edges.map((edge) => edge.id);
    const [nodes, edges] = await Promise.all([
      nodeIds.length > 0
        ? manager.find(ResourceFlowNode, { where: { id: In(nodeIds) }, select: { id: true } })
        : Promise.resolve([]),
      edgeIds.length > 0
        ? manager.find(ResourceFlowEdge, { where: { id: In(edgeIds) }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    if (nodes.length === 0 && edges.length === 0) return;
    throw new FlowCanvasIdConflictError(
      nodes.map((node) => node.id),
      edges.map((edge) => edge.id),
    );
  }

  private replaceCanvas(
    owner: CanvasOwner,
    canvas: FlowCanvasInput,
    audit: CanvasAuditFactory,
  ): Promise<{ previous: FlowCanvas; saved: FlowCanvas }> {
    return this.unitOfWork.run(async (scope) => {
      const manager = this.unitOfWork.handleOf(scope);
      // Two saves of one canvas must not interleave their delete and insert (the second delete cannot see the first
      // save's new rows), so they queue on an advisory lock of the owner until the first transaction ends.
      await lockCanvasOwner(manager, owner);
      const previous = await this.loadCanvas(manager, owner);

      // Delete the existing rows first (cascading handles relationships), then check the new ids.
      await manager.delete(ResourceFlowNode, owner);
      await manager.delete(ResourceFlowEdge, owner);
      await this.assertIdsNotOwnedElsewhere(manager, canvas);

      const columns = ownerColumns(owner);
      const newNodes = canvas.nodes.map((nodeData) => {
        const node = new ResourceFlowNode();
        node.id = nodeData.id;
        node.type = nodeData.type as ResourceFlowNodeType;
        node.position = { x: nodeData.position.x, y: nodeData.position.y };
        node.data = nodeData.data || {};
        node.resourceId = columns.resourceId;
        node.flowId = columns.flowId;
        return node;
      });
      const newEdges = canvas.edges.map((edgeData) => {
        const edge = new ResourceFlowEdge();
        edge.id = edgeData.id;
        edge.source = edgeData.source;
        edge.sourceHandle = edgeData.sourceHandle;
        edge.target = edgeData.target;
        edge.targetHandle = edgeData.targetHandle;
        edge.resourceId = columns.resourceId;
        edge.flowId = columns.flowId;
        return edge;
      });
      const [savedNodes, savedEdges] = await Promise.all([
        manager.save(ResourceFlowNode, newNodes),
        manager.save(ResourceFlowEdge, newEdges),
      ]);

      const event = audit(previous);
      if (event) await this.audit.record(event, scope);

      return { previous, saved: { nodes: savedNodes.map(toNodeRecord), edges: savedEdges.map(toEdgeRecord) } };
    });
  }

  replaceResourceCanvas(resourceId: number, canvas: FlowCanvasInput, audit: CanvasAuditFactory) {
    return this.replaceCanvas({ resourceId }, canvas, audit);
  }

  replaceGlobalCanvas(flowId: number, canvas: FlowCanvasInput, audit: CanvasAuditFactory) {
    return this.replaceCanvas({ flowId }, canvas, audit);
  }

  async listGlobalFlows(): Promise<GlobalFlowSummary[]> {
    const flows = await this.flows.find({ where: GLOBAL_SCOPE, order: { name: 'ASC', id: 'ASC' } });
    const counts: Array<{ flowId: number; count: string | number }> = await this.nodes
      .createQueryBuilder('node')
      .innerJoin('node.flow', 'flow', 'flow.scope = :scope', GLOBAL_SCOPE)
      .select('node.flowId', 'flowId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('node.flowId')
      .getRawMany();
    const countByFlow = new Map(counts.map((row) => [Number(row.flowId), Number(row.count)]));
    return flows.map((flow) => ({ ...toFlowRecord(flow), nodeCount: countByFlow.get(flow.id) ?? 0 }));
  }

  async findGlobalFlow(flowId: number): Promise<FlowRecord | null> {
    const flow = await this.flows.findOne({ where: { id: flowId, ...GLOBAL_SCOPE } });
    return flow ? toFlowRecord(flow) : null;
  }

  async createGlobalFlow(draft: GlobalFlowDraft): Promise<FlowRecord> {
    return toFlowRecord(await this.flows.save(this.flows.create({ ...draft, scope: 'global' })));
  }

  async updateGlobalFlow(flow: FlowRecord): Promise<FlowRecord> {
    const entity = await this.flows.findOneByOrFail({ id: flow.id });
    entity.name = flow.name;
    entity.description = flow.description;
    entity.enabled = flow.enabled;
    return toFlowRecord(await this.flows.save(entity));
  }

  deleteGlobalFlow(flowId: number, audit: (canvas: FlowCanvas) => AuditEvent): Promise<boolean> {
    return this.unitOfWork.run(async (scope) => {
      const manager = this.unitOfWork.handleOf(scope);
      const canvas = await this.loadCanvas(manager, { flowId });
      const deleted = await manager.delete(Flow, { id: flowId });
      // A concurrent delete got there first and recorded it.
      if (!deleted.affected) return false;
      await this.audit.record(audit(canvas), scope);
      return true;
    });
  }
}
