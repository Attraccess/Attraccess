import { FlowRecord, ResourceFlowNodeType } from '@attraccess/application-models';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CreateGlobalFlowDto,
  GlobalFlowSummaryDto,
  ResourceFlowResponseDto,
  ResourceFlowSaveDto,
  UpdateGlobalFlowDto,
} from './dto/index';
import { FLOW_GRAPH_STORE, FlowCanvasIdConflictError, FlowGraphStore } from './flow-graph.port';
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
export type GlobalFlow = FlowRecord & { scope: 'global' };

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
    @Inject(FLOW_GRAPH_STORE) private readonly graph: FlowGraphStore,
    private readonly resourceFlows: ResourceFlowsService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  public async list(): Promise<GlobalFlowSummaryDto[]> {
    return (await this.graph.listGlobalFlows()).map((flow) => ({ ...flow, scope: 'global' as const }));
  }

  /** Only flows of the global scope; other scopes (ATT-1204) are not reachable here. */
  public async get(flowId: number): Promise<GlobalFlow> {
    const flow = await this.graph.findGlobalFlow(flowId);
    if (!flow) throw new NotFoundException(`Flow with ID ${flowId} not found`);
    return flow as GlobalFlow;
  }

  private recordFlow(
    action: 'flow.created' | 'flow.updated' | 'flow.deleted',
    actor: AuditActor,
    flowId: number,
    details: Record<string, string | number>,
  ) {
    return this.audit.record({ domain: 'resource', action, actor, subject: { type: 'flow', id: flowId }, details });
  }

  public async create(dto: CreateGlobalFlowDto, actor: AuditActor): Promise<GlobalFlow> {
    const flow = (await this.graph.createGlobalFlow({
      name: requireName(dto.name),
      description: dto.description?.trim() || null,
      enabled: dto.enabled ?? true,
    })) as GlobalFlow;
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
    const saved = (await this.graph.updateGlobalFlow(flow)) as GlobalFlow;
    await this.recordFlowUpdate(flowId, actor, before, saved);
    if (!wasEnabled && saved.enabled) {
      // Topics of a flow that was off may not be subscribed yet.
      const nodes = await this.graph.findGlobalFlowNodes(flowId);
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
    await this.graph.deleteGlobalFlow(flowId, (canvas) => ({
      domain: 'resource',
      action: 'flow.deleted',
      actor,
      subject: { type: 'flow', id: flowId },
      details: canvasDetails(
        { 'before.name': fitAuditText(flow.name, FLOW_NAME_BYTES), 'before.enabled': flow.enabled ? 1 : 0 },
        canvas,
      ) as Record<string, string | number>,
    }));
  }

  public async getCanvas(flowId: number): Promise<ResourceFlowResponse> {
    await this.get(flowId);
    const { nodes, edges } = await this.graph.loadGlobalCanvas(flowId);
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
    this.resourceFlows.assertEdgesReferenceNodes(flowData.nodes, flowData.edges);

    const validationContext = new Map<string, unknown>();
    const validationErrors: ValidationError[] = [];
    for (const nodeData of flowData.nodes) {
      validationErrors.push(...(await this.resourceFlows.validateNodeData(nodeData, validationContext)));
    }

    let result: Awaited<ReturnType<FlowGraphStore['replaceGlobalCanvas']>>;
    try {
      result = await this.graph.replaceGlobalCanvas(flowId, flowData, (previous) => {
        const diff = diffCanvas(previous, flowData);
        return diff
          ? {
              domain: 'resource',
              action: 'flow.canvas_updated',
              actor,
              subject: { type: 'flow', id: flowId },
              details: canvasSaveDetails(previous, flowData, diff, flow.name),
            }
          : undefined;
      });
    } catch (error) {
      if (error instanceof FlowCanvasIdConflictError) throw this.resourceFlows.canvasIdConflict(error);
      throw error;
    }

    if (flow.enabled) {
      this.resourceFlows.subscribeToChangedMqttNodes(result.previous.nodes, flowData.nodes);
    }

    return {
      nodes: result.saved.nodes,
      edges: result.saved.edges,
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
