import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BillingTransactionItemCreateSchema,
  ButtonNodeDataSchema,
  EventNodeDataSchema,
  ErrorNodeDataSchema,
  getNodeDataSchema,
  HttpRequestNodeDataSchema,
  IfNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceFlowNodeType,
  ResourceSubFlow,
  ResourceSubFlowEdge,
  ResourceSubFlowNode,
  ResourceUsageEndSessionNodeDataSchema,
  SetPayloadNodeDataSchema,
  SubFlowInputNodeDataSchema,
  SubFlowNodeDataSchema,
  SubFlowOutputNodeDataSchema,
  WaitNodeDataSchema,
} from '@attraccess/database-entities';
import { z } from 'zod';
import { SubFlowListResponseDto, SubFlowResponseDto, SubFlowSaveDto } from './dto';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { ValidationError } from './resource-flows.service';

const SUB_FLOW_SUPPORTED_NODE_TYPES = new Set<ResourceFlowNodeType>([
  ResourceFlowNodeType.INPUT_SUBFLOW,
  ResourceFlowNodeType.OUTPUT_SUBFLOW,
  ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
  ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST,
  ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
  ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
  ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY,
  ResourceFlowNodeType.PROCESSING_WAIT,
  ResourceFlowNodeType.PROCESSING_IF,
  ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
  ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
  ResourceFlowNodeType.PROCESSING_ERROR,
]);

@Injectable()
export class ResourceSubFlowsService {
  constructor(
    @InjectRepository(ResourceSubFlow)
    private readonly subFlowRepository: Repository<ResourceSubFlow>,
    @InjectRepository(ResourceSubFlowNode)
    private readonly subFlowNodeRepository: Repository<ResourceSubFlowNode>,
    @InjectRepository(ResourceSubFlowEdge)
    private readonly subFlowEdgeRepository: Repository<ResourceSubFlowEdge>,
  ) {}

  async listSubFlows(): Promise<SubFlowListResponseDto[]> {
    const subFlows = await this.subFlowRepository.find({
      order: { updatedAt: 'DESC' },
    });

    if (subFlows.length === 0) {
      return [];
    }

    const subFlowIds = subFlows.map((subFlow) => subFlow.id);
    const nodes = await this.subFlowNodeRepository.find({
      where: { subFlowId: In(subFlowIds) },
    });

    const handlesBySubFlow = this.collectHandlesBySubFlow(nodes);

    return subFlows.map((subFlow) => {
      const handles = handlesBySubFlow.get(subFlow.id) ?? { inputs: [], outputs: [] };
      return {
        id: subFlow.id,
        name: subFlow.name,
        description: subFlow.description,
        inputs: handles.inputs,
        outputs: handles.outputs,
        createdAt: subFlow.createdAt,
        updatedAt: subFlow.updatedAt,
      };
    });
  }

  async getSubFlow(subFlowId: number): Promise<SubFlowResponseDto> {
    const subFlow = await this.subFlowRepository.findOne({
      where: { id: subFlowId },
    });

    if (!subFlow) {
      throw new NotFoundException('SUB_FLOW_NOT_FOUND', { cause: { subFlowId } });
    }

    const [nodes, edges] = await Promise.all([
      this.subFlowNodeRepository.find({ where: { subFlowId } }),
      this.subFlowEdgeRepository.find({ where: { subFlowId } }),
    ]);

    const handles = this.collectHandles(nodes);

    return {
      id: subFlow.id,
      name: subFlow.name,
      description: subFlow.description,
      nodes,
      edges,
      inputs: handles.inputs,
      outputs: handles.outputs,
      createdAt: subFlow.createdAt,
      updatedAt: subFlow.updatedAt,
    };
  }

  async createSubFlow(dto: SubFlowSaveDto): Promise<SubFlowResponseDto> {
    const subFlow = this.subFlowRepository.create({
      name: dto.name,
      description: dto.description ?? null,
    });

    return this.saveSubFlow(subFlow, dto, false);
  }

  async updateSubFlow(subFlowId: number, dto: SubFlowSaveDto): Promise<SubFlowResponseDto> {
    const existing = await this.subFlowRepository.findOne({
      where: { id: subFlowId },
    });

    if (!existing) {
      throw new NotFoundException('SUB_FLOW_NOT_FOUND', { cause: { subFlowId } });
    }

    existing.name = dto.name;
    existing.description = dto.description ?? null;

    return this.saveSubFlow(existing, dto, true);
  }

  async deleteSubFlow(subFlowId: number): Promise<void> {
    await this.subFlowRepository.delete(subFlowId);
  }

  public async getSubFlowNodeSchemas(): Promise<ResourceFlowNodeSchemaDto[]> {
    return Object.values(ResourceFlowNodeType).map((type) => {
      const schema: ResourceFlowNodeSchemaDto = {
        type,
        configSchema: {},
        inputs: [],
        outputs: [],
        supportedByResource: SUB_FLOW_SUPPORTED_NODE_TYPES.has(type),
        isOutput: false,
      };

      switch (type) {
        case ResourceFlowNodeType.INPUT_SUBFLOW:
          schema.configSchema = z.toJSONSchema(SubFlowInputNodeDataSchema);
          schema.outputs = ['output'];
          break;

        case ResourceFlowNodeType.OUTPUT_SUBFLOW:
          schema.configSchema = z.toJSONSchema(SubFlowOutputNodeDataSchema);
          schema.inputs = ['input'];
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
          schema.configSchema = z.toJSONSchema(BillingTransactionItemCreateSchema);
          schema.inputs = ['input'];
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
          schema.configSchema = z.toJSONSchema(HttpRequestNodeDataSchema);
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
          schema.configSchema = z.toJSONSchema(MqttSendMessageNodeDataSchema);
          schema.inputs = ['input'];
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION:
          schema.configSchema = z.toJSONSchema(ResourceUsageEndSessionNodeDataSchema);
          schema.inputs = ['input'];
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY:
          schema.configSchema = z.toJSONSchema(ResourceActivityTrackActivityNodeDataSchema);
          schema.inputs = ['input'];
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.PROCESSING_WAIT:
          schema.configSchema = z.toJSONSchema(WaitNodeDataSchema);
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          break;

        case ResourceFlowNodeType.PROCESSING_IF:
          schema.configSchema = z.toJSONSchema(IfNodeDataSchema);
          schema.inputs = ['input'];
          schema.outputs = ['output-true', 'output-false'];
          break;

        case ResourceFlowNodeType.PROCESSING_SET_PAYLOAD:
          schema.configSchema = z.toJSONSchema(SetPayloadNodeDataSchema);
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          break;

        case ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE:
          schema.configSchema = z.toJSONSchema(MqttWaitForMessageNodeDataSchema);
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          break;

        case ResourceFlowNodeType.PROCESSING_ERROR:
          schema.configSchema = z.toJSONSchema(ErrorNodeDataSchema);
          schema.inputs = ['input'];
          break;

        case ResourceFlowNodeType.PROCESSING_SUBFLOW:
          schema.configSchema = z.toJSONSchema(SubFlowNodeDataSchema);
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = false;
          break;

        case ResourceFlowNodeType.INPUT_BUTTON:
          schema.configSchema = z.toJSONSchema(ButtonNodeDataSchema);
          schema.outputs = ['output'];
          schema.supportedByResource = false;
          break;

        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
          schema.configSchema = z.toJSONSchema(EventNodeDataSchema);
          schema.outputs = ['output'];
          schema.supportedByResource = false;
          break;

        case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
          schema.configSchema = z.toJSONSchema(MqttMessageReceivedNodeDataSchema);
          schema.outputs = ['output'];
          schema.supportedByResource = false;
          break;

        case ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY:
          schema.configSchema = z.toJSONSchema(InputResourceActivityNoActivityNodeDataSchema);
          schema.outputs = ['output'];
          schema.supportedByResource = false;
          break;

        default: {
          const exhaustiveCheck: never = type;
          throw new Error(`Unknown node type: ${exhaustiveCheck}`);
        }
      }

      return schema;
    });
  }

  private async saveSubFlow(
    subFlow: ResourceSubFlow,
    dto: SubFlowSaveDto,
    isUpdate: boolean,
  ): Promise<SubFlowResponseDto> {
    const validationErrors = this.validateNodes(dto.nodes);

    const result = await this.subFlowRepository.manager.transaction(async (transactionalEntityManager) => {
      const savedSubFlow = await transactionalEntityManager.save(ResourceSubFlow, subFlow);

      if (isUpdate) {
        await transactionalEntityManager.delete(ResourceSubFlowNode, { subFlow: { id: savedSubFlow.id } });
        await transactionalEntityManager.delete(ResourceSubFlowEdge, { subFlow: { id: savedSubFlow.id } });
      }

      const newNodes = dto.nodes.map((nodeData) => {
        const node = new ResourceSubFlowNode();
        node.id = nodeData.id;
        node.type = nodeData.type;
        node.position = {
          x: nodeData.position.x,
          y: nodeData.position.y,
        };
        node.data = nodeData.data || {};
        node.subFlow = savedSubFlow;
        return node;
      });

      const newEdges = dto.edges.map((edgeData) => {
        const edge = new ResourceSubFlowEdge();
        edge.id = edgeData.id;
        edge.source = edgeData.source;
        edge.sourceHandle = edgeData.sourceHandle;
        edge.target = edgeData.target;
        edge.targetHandle = edgeData.targetHandle;
        edge.subFlow = savedSubFlow;
        return edge;
      });

      const [savedNodes, savedEdges] = await Promise.all([
        transactionalEntityManager.save(ResourceSubFlowNode, newNodes),
        transactionalEntityManager.save(ResourceSubFlowEdge, newEdges),
      ]);

      return { subFlow: savedSubFlow, nodes: savedNodes, edges: savedEdges };
    });

    const handles = this.collectHandles(result.nodes);

    const response: SubFlowResponseDto = {
      id: result.subFlow.id,
      name: result.subFlow.name,
      description: result.subFlow.description,
      nodes: result.nodes,
      edges: result.edges,
      inputs: handles.inputs,
      outputs: handles.outputs,
      createdAt: result.subFlow.createdAt,
      updatedAt: result.subFlow.updatedAt,
    };

    if (validationErrors.length > 0) {
      response.validationErrors = validationErrors;
    }

    return response;
  }

  private validateNodes(nodes: SubFlowSaveDto['nodes']): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const nodeData of nodes) {
      if (!SUB_FLOW_SUPPORTED_NODE_TYPES.has(nodeData.type)) {
        errors.push({
          nodeId: nodeData.id,
          nodeType: nodeData.type,
          field: 'type',
          message: `Node type is not supported in sub-flows: ${nodeData.type}`,
          value: nodeData.type,
        });
        continue;
      }

      try {
        const schema = getNodeDataSchema(nodeData.type);
        schema.parse(nodeData.data);
      } catch (error) {
        if (error.errors) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error.errors.forEach((zodError: any) => {
            errors.push({
              nodeId: nodeData.id,
              nodeType: nodeData.type,
              field: zodError.path?.join('.') || 'data',
              message: zodError.message,
              value: zodError.received,
            });
          });
        } else {
          errors.push({
            nodeId: nodeData.id,
            nodeType: nodeData.type,
            field: 'data',
            message: error.message || 'Invalid node data',
            value: nodeData.data,
          });
        }
      }
    }

    return errors;
  }

  private collectHandles(nodes: ResourceSubFlowNode[]) {
    const inputs = new Set<string>();
    const outputs = new Set<string>();

    nodes.forEach((node) => {
      if (node.type === ResourceFlowNodeType.INPUT_SUBFLOW) {
        const parsed = SubFlowInputNodeDataSchema.safeParse(node.data);
        if (parsed.success) {
          inputs.add(parsed.data.name);
        }
      }

      if (node.type === ResourceFlowNodeType.OUTPUT_SUBFLOW) {
        const parsed = SubFlowOutputNodeDataSchema.safeParse(node.data);
        if (parsed.success) {
          outputs.add(parsed.data.name);
        }
      }
    });

    return { inputs: Array.from(inputs), outputs: Array.from(outputs) };
  }

  private collectHandlesBySubFlow(nodes: ResourceSubFlowNode[]) {
    const handlesBySubFlow = new Map<number, { inputs: Set<string>; outputs: Set<string> }>();

    nodes.forEach((node) => {
      const entry = handlesBySubFlow.get(node.subFlowId) ?? { inputs: new Set<string>(), outputs: new Set<string>() };

      if (node.type === ResourceFlowNodeType.INPUT_SUBFLOW) {
        const parsed = SubFlowInputNodeDataSchema.safeParse(node.data);
        if (parsed.success) {
          entry.inputs.add(parsed.data.name);
        }
      }

      if (node.type === ResourceFlowNodeType.OUTPUT_SUBFLOW) {
        const parsed = SubFlowOutputNodeDataSchema.safeParse(node.data);
        if (parsed.success) {
          entry.outputs.add(parsed.data.name);
        }
      }

      handlesBySubFlow.set(node.subFlowId, entry);
    });

    const normalized = new Map<number, { inputs: string[]; outputs: string[] }>();
    handlesBySubFlow.forEach((value, key) => {
      normalized.set(key, { inputs: Array.from(value.inputs), outputs: Array.from(value.outputs) });
    });

    return normalized;
  }
}
