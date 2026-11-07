import { Flow, ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateGlobalFlowDto,
  GlobalFlowSummaryDto,
  ResourceFlowResponseDto,
  ResourceFlowSaveDto,
  UpdateGlobalFlowDto,
} from './dto/index';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { ResourceFlowResponse, ResourceFlowsService, ValidationError } from './resource-flows.service';

const MQTT_TYPES = [
  ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
  ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
];

/** Global flows: named flows that are not bound to one resource. Canvas rules are shared with resource flows. */
@Injectable()
export class GlobalFlowsService {
  private readonly logger = new Logger(GlobalFlowsService.name);

  constructor(
    @InjectRepository(Flow) private readonly flowRepository: Repository<Flow>,
    @InjectRepository(ResourceFlowNode) private readonly nodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) private readonly edgeRepository: Repository<ResourceFlowEdge>,
    private readonly resourceFlows: ResourceFlowsService,
  ) {}

  public async list(): Promise<GlobalFlowSummaryDto[]> {
    const flows = await this.flowRepository.find({ order: { name: 'ASC', id: 'ASC' } });
    const counts: Array<{ flowId: number; count: string | number }> = await this.nodeRepository
      .createQueryBuilder('node')
      .select('node.flowId', 'flowId')
      .addSelect('COUNT(*)', 'count')
      .where('node.flowId IS NOT NULL')
      .groupBy('node.flowId')
      .getRawMany();
    const countByFlow = new Map(counts.map((row) => [Number(row.flowId), Number(row.count)]));
    return flows.map((flow) => ({ ...flow, nodeCount: countByFlow.get(flow.id) ?? 0 }));
  }

  public async get(flowId: number): Promise<Flow> {
    const flow = await this.flowRepository.findOne({ where: { id: flowId } });
    if (!flow) throw new NotFoundException(`Flow with ID ${flowId} not found`);
    return flow;
  }

  public async create(dto: CreateGlobalFlowDto): Promise<Flow> {
    return this.flowRepository.save(
      this.flowRepository.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        enabled: dto.enabled ?? true,
        scope: 'global',
      }),
    );
  }

  public async update(flowId: number, dto: UpdateGlobalFlowDto): Promise<Flow> {
    const flow = await this.get(flowId);
    const wasEnabled = flow.enabled;
    if (dto.name !== undefined) flow.name = dto.name.trim();
    if (dto.description !== undefined) flow.description = dto.description?.trim() || null;
    if (dto.enabled !== undefined) flow.enabled = dto.enabled;
    const saved = await this.flowRepository.save(flow);
    if (!wasEnabled && saved.enabled) {
      // Topics of a flow that was off may not be subscribed yet.
      const nodes = await this.nodeRepository.find({ where: { flowId } });
      for (const node of nodes.filter((n) => MQTT_TYPES.includes(n.type))) {
        this.resourceFlows.subscribeToNodeTopic(node.data ?? {});
      }
    }
    return saved;
  }

  /** Nodes and edges go with the flow (cascade). */
  public async delete(flowId: number): Promise<void> {
    await this.get(flowId);
    await this.flowRepository.delete({ id: flowId });
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

  public async saveCanvas(flowId: number, flowData: ResourceFlowSaveDto): Promise<ResourceFlowResponseDto> {
    const flow = await this.get(flowId);
    this.resourceFlows.assertNodesSupportScope(flowData.nodes, 'global');

    const validationContext = new Map<string, unknown>();
    const validationErrors: ValidationError[] = [];
    for (const nodeData of flowData.nodes) {
      validationErrors.push(...(await this.resourceFlows.validateNodeData(nodeData, validationContext)));
    }

    const result = await this.nodeRepository.manager.transaction(async (manager) => {
      const oldNodes = await manager.find(ResourceFlowNode, { where: { flowId } });
      await manager.delete(ResourceFlowNode, { flowId });
      await manager.delete(ResourceFlowEdge, { flowId });

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
