import { Flow, ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateGlobalFlowDto,
  GlobalFlowSummaryDto,
  ResourceFlowResponseDto,
  ResourceFlowSaveDto,
  UpdateGlobalFlowDto,
} from './dto/index';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../audit/recorder/audit-event';
import { fitAuditText, fitAuditTexts } from '../../audit/policies/projection';
import { FLOW_NAME_BYTES, canvasDetails, canvasSaveDetails, diffCanvas } from './flow-audit';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { ResourceFlowResponse, ResourceFlowsService, ValidationError } from './resource-flows.service';

const MQTT_TYPES = [
  ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
  ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
];

/** A flow row known to be a global flow. */
export type GlobalFlow = Flow & { scope: 'global' };

const GLOBAL_SCOPE = { scope: 'global' } as const;

/** Trims a flow name and rejects null or blank names. */
function requireName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new BadRequestException('name must be a non-empty string');
  return trimmed;
}

/** Global flows: named flows that are not bound to one resource. Canvas rules are shared with resource flows. */
@Injectable()
export class GlobalFlowsService {
  private readonly logger = new Logger(GlobalFlowsService.name);

  constructor(
    @InjectRepository(Flow) private readonly flowRepository: Repository<Flow>,
    @InjectRepository(ResourceFlowNode) private readonly nodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) private readonly edgeRepository: Repository<ResourceFlowEdge>,
    private readonly resourceFlows: ResourceFlowsService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  public async list(): Promise<GlobalFlowSummaryDto[]> {
    const flows = (await this.flowRepository.find({
      where: GLOBAL_SCOPE,
      order: { name: 'ASC', id: 'ASC' },
    })) as GlobalFlow[];
    const counts: Array<{ flowId: number; count: string | number }> = await this.nodeRepository
      .createQueryBuilder('node')
      .innerJoin('node.flow', 'flow', 'flow.scope = :scope', GLOBAL_SCOPE)
      .select('node.flowId', 'flowId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('node.flowId')
      .getRawMany();
    const countByFlow = new Map(counts.map((row) => [Number(row.flowId), Number(row.count)]));
    return flows.map((flow) => ({ ...flow, nodeCount: countByFlow.get(flow.id) ?? 0 }));
  }

  /** Only flows of the global scope; other scopes (ATT-1204) are not reachable here. */
  public async get(flowId: number): Promise<GlobalFlow> {
    const flow = await this.flowRepository.findOne({ where: { id: flowId, ...GLOBAL_SCOPE } });
    if (!flow) throw new NotFoundException(`Flow with ID ${flowId} not found`);
    return flow as GlobalFlow;
  }

  private recordFlow(
    action: 'flow.created' | 'flow.updated' | 'flow.deleted',
    actor: AuditActor,
    flowId: number,
    details: Record<string, string | number>,
    manager?: EntityManager,
  ) {
    return this.audit.record(
      { domain: 'resource', action, actor, subject: { type: 'flow', id: flowId }, details },
      manager,
    );
  }

  public async create(dto: CreateGlobalFlowDto, actor: AuditActor): Promise<GlobalFlow> {
    const flow = (await this.flowRepository.save(
      this.flowRepository.create({
        name: requireName(dto.name),
        description: dto.description?.trim() || null,
        enabled: dto.enabled ?? true,
        scope: 'global',
      }),
    )) as GlobalFlow;
    const enabled = { 'after.enabled': flow.enabled ? 1 : 0 };
    await this.recordFlow('flow.created', actor, flow.id, {
      ...fitAuditTexts(
        { 'after.name': flow.name, ...(flow.description ? { 'after.description': flow.description } : {}) },
        enabled,
      ),
      ...enabled,
    });
    return flow;
  }

  public async update(flowId: number, dto: UpdateGlobalFlowDto, actor: AuditActor): Promise<GlobalFlow> {
    if (dto.enabled !== undefined && typeof dto.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    const name = dto.name !== undefined ? requireName(dto.name) : undefined;
    const flow = await this.get(flowId);
    const before = { name: flow.name, description: flow.description ?? '', enabled: flow.enabled };
    const wasEnabled = flow.enabled;
    if (name !== undefined) flow.name = name;
    if (dto.description !== undefined) flow.description = dto.description?.trim() || null;
    if (dto.enabled !== undefined) flow.enabled = dto.enabled;
    const saved = (await this.flowRepository.save(flow)) as GlobalFlow;
    await this.recordFlowUpdate(flowId, actor, before, saved);
    if (!wasEnabled && saved.enabled) {
      // Topics of a flow that was off may not be subscribed yet.
      const nodes = await this.nodeRepository.find({ where: { flowId } });
      for (const node of nodes.filter((n) => MQTT_TYPES.includes(n.type))) {
        this.resourceFlows.subscribeToNodeTopic(node.data ?? {});
      }
    }
    return saved;
  }

  /** Records the changed metadata fields, before and after. Nothing changed, nothing recorded. */
  private async recordFlowUpdate(
    flowId: number,
    actor: AuditActor,
    before: { name: string; description: string; enabled: boolean },
    saved: GlobalFlow,
  ): Promise<void> {
    const after = { name: saved.name, description: saved.description ?? '', enabled: saved.enabled };
    const changedFields = (['name', 'description', 'enabled'] as const).filter(
      (field) => before[field] !== after[field],
    );
    if (changedFields.length === 0) return;
    const text = (prefix: 'before' | 'after', source: typeof before) =>
      Object.fromEntries(
        changedFields
          .filter((field) => field !== 'enabled')
          .map((field) => [`${prefix}.${field}`, source[field] as string]),
      );
    const enabled = changedFields.includes('enabled')
      ? { 'before.enabled': before.enabled ? 1 : 0, 'after.enabled': after.enabled ? 1 : 0 }
      : {};
    const fixed = { changedFields: JSON.stringify(changedFields), ...enabled };
    await this.recordFlow('flow.updated', actor, flowId, {
      ...fitAuditTexts({ flowName: saved.name, ...text('before', before), ...text('after', after) }, fixed),
      ...fixed,
    });
  }

  /**
   * Nodes and edges go with the flow (cascade), so the canvas is read and recorded in the same transaction as the
   * delete: the audit row holds exactly what was deleted and commits or rolls back with it.
   */
  public async delete(flowId: number, actor: AuditActor): Promise<void> {
    const flow = await this.get(flowId);
    await this.nodeRepository.manager.transaction(async (manager) => {
      const nodes = await manager.find(ResourceFlowNode, { where: { flowId } });
      const edges = await manager.find(ResourceFlowEdge, { where: { flowId } });
      await manager.delete(Flow, { id: flowId });
      await this.recordFlow(
        'flow.deleted',
        actor,
        flowId,
        canvasDetails(
          { 'before.name': fitAuditText(flow.name, FLOW_NAME_BYTES), 'before.enabled': flow.enabled ? 1 : 0 },
          { nodes, edges },
        ) as Record<string, string | number>,
        manager,
      );
    });
  }

  public async getCanvas(flowId: number): Promise<ResourceFlowResponse> {
    await this.get(flowId);
    const [nodes, edges] = await Promise.all([
      this.nodeRepository.find({ where: { flowId } }),
      this.edgeRepository.find({ where: { flowId } }),
    ]);
    const validationErrors: ValidationError[] = [];
    const validationContext = new Map<string, unknown>();
    for (let index = 0; index < nodes.length; index += 4) {
      validationErrors.push(
        ...(
          await Promise.all(
            nodes.slice(index, index + 4).map((node) => this.resourceFlows.validateNodeData(node, validationContext)),
          )
        ).flat(),
      );
    }
    return { nodes, edges, ...(validationErrors.length ? { validationErrors } : {}) };
  }

  public async saveCanvas(
    flowId: number,
    flowData: ResourceFlowSaveDto,
    actor: AuditActor,
  ): Promise<ResourceFlowResponseDto> {
    const flow = await this.get(flowId);
    this.resourceFlows.assertNodesSupportScope(flowData.nodes, 'global');

    const validationContext = new Map<string, unknown>();
    const validationErrors: ValidationError[] = [];
    for (const nodeData of flowData.nodes) {
      validationErrors.push(...(await this.resourceFlows.validateNodeData(nodeData, validationContext)));
    }

    const result = await this.nodeRepository.manager.transaction(async (manager) => {
      const oldNodes = await manager.find(ResourceFlowNode, { where: { flowId } });
      const oldEdges = await manager.find(ResourceFlowEdge, { where: { flowId } });
      await manager.delete(ResourceFlowNode, { flowId });
      await manager.delete(ResourceFlowEdge, { flowId });
      await this.resourceFlows.assertCanvasIdsNotOwnedElsewhere(manager, flowData);

      const newNodes = flowData.nodes.map((nodeData) => {
        const node = new ResourceFlowNode();
        node.id = nodeData.id;
        node.type = nodeData.type as ResourceFlowNodeType;
        node.position = { x: nodeData.position.x, y: nodeData.position.y };
        node.data = nodeData.data || {};
        node.flowId = flow.id;
        node.resourceId = null;
        return node;
      });
      const newEdges = flowData.edges.map((edgeData) => {
        const edge = new ResourceFlowEdge();
        edge.id = edgeData.id;
        edge.source = edgeData.source;
        edge.sourceHandle = edgeData.sourceHandle;
        edge.target = edgeData.target;
        edge.targetHandle = edgeData.targetHandle;
        edge.flowId = flow.id;
        edge.resourceId = null;
        return edge;
      });
      const [savedNodes, savedEdges] = await Promise.all([
        manager.save(ResourceFlowNode, newNodes),
        manager.save(ResourceFlowEdge, newEdges),
      ]);
      const diff = diffCanvas({ nodes: oldNodes, edges: oldEdges }, flowData);
      if (diff) {
        await this.audit.record(
          {
            domain: 'resource',
            action: 'flow.canvas_updated',
            actor,
            subject: { type: 'flow', id: flowId },
            details: canvasSaveDetails({ nodes: oldNodes, edges: oldEdges }, flowData, diff, flow.name),
          },
          manager,
        );
      }
      return { savedNodes, savedEdges, oldNodes };
    });

    if (flow.enabled) {
      this.resourceFlows.subscribeToChangedMqttNodes(result.oldNodes, flowData.nodes);
    }

    return {
      nodes: result.savedNodes,
      edges: result.savedEdges,
      ...(validationErrors.length > 0 ? { validationErrors } : {}),
    };
  }

  public getNodeSchemas(): Promise<ResourceFlowNodeSchemaDto[]> {
    return this.resourceFlows.getNodeSchemas();
  }

  public async resolveNodeSchema(
    flowId: number,
    nodeType: string,
    config: Record<string, unknown>,
    purpose: 'editor' | 'preview' = 'editor',
  ): Promise<ResourceFlowNodeSchemaDto> {
    await this.get(flowId);
    return this.resourceFlows.resolvePluginNodeSchema(
      nodeType,
      config,
      { flowScope: 'global', resourceId: null, flowId },
      purpose,
    );
  }
}
