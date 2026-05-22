import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
  ResourceFlowLog,
  getNodeDataSchema,
  ResourceFlowNodeType,
  EventNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  WaitNodeDataSchema,
  ResourceType,
  ButtonNodeDataSchema,
  IfNodeDataSchema,
  BillingTransactionItemCreateSchema,
  SetPayloadNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
  ErrorNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceActivityTrackActivityNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
} from '@attraccess/database-entities';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceFlowSaveDto, ResourceFlowResponseDto } from './dto';
import { PaginatedResponse } from '../../types/response';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { z } from 'zod';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ValidationError {
  nodeId: string;
  nodeType: string;
  field: string;
  message: string;
  value?: unknown;
}

export interface ResourceFlowResponse {
  nodes: ResourceFlowNode[];
  edges: ResourceFlowEdge[];
  validationErrors?: ValidationError[];
}

@Injectable()
export class ResourceFlowsService {
  private readonly logger = new Logger(ResourceFlowsService.name);

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    private readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceFlowLog)
    private readonly flowLogRepository: Repository<ResourceFlowLog>,
    private readonly mqttClientService: MqttClientService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getResourceFlow(resourceId: number): Promise<ResourceFlowResponse> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Get all nodes and edges for the resource
    const [nodes, edges] = await Promise.all([
      this.flowNodeRepository.find({
        where: { resource: { id: resourceId } },
      }),
      this.flowEdgeRepository.find({
        where: { resource: { id: resourceId } },
      }),
    ]);

    return { nodes, edges };
  }

  private validateNodeData(nodeData: { id: string; type: ResourceFlowNodeType; data: unknown }): ValidationError[] {
    const errors: ValidationError[] = [];

    try {
      const schema = getNodeDataSchema(nodeData.type);
      schema.parse(nodeData.data);
    } catch (error) {
      // Handle Zod validation errors
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
        // Fallback for other types of errors
        errors.push({
          nodeId: nodeData.id,
          nodeType: nodeData.type,
          field: 'data',
          message: error.message || 'Invalid node data',
          value: nodeData.data,
        });
      }
    }

    return errors;
  }

  async saveResourceFlow(resourceId: number, flowData: ResourceFlowSaveDto): Promise<ResourceFlowResponseDto> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Collect validation errors from all nodes
    const allValidationErrors: ValidationError[] = [];
    for (const nodeData of flowData.nodes) {
      const nodeErrors = this.validateNodeData(nodeData);
      allValidationErrors.push(...nodeErrors);
    }

    // Start transaction to ensure data consistency
    const result = await this.flowNodeRepository.manager.transaction(async (transactionalEntityManager) => {
      const [oldMqttMessageReceivedNodes, oldMqttWaitForMessageNodes] = await Promise.all([
        transactionalEntityManager.find(ResourceFlowNode, {
          where: { resource: { id: resourceId }, type: ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED },
        }),
        transactionalEntityManager.find(ResourceFlowNode, {
          where: { resource: { id: resourceId }, type: ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE },
        }),
      ]);

      const newOrChangedMqttMessageReceivedNodes = [] as typeof flowData.nodes;
      const newOrChangedMqttWaitForMessageNodes = [] as typeof flowData.nodes;

      for (const nodeData of flowData.nodes) {
        if (nodeData.type === ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED) {
          const existingNode = oldMqttMessageReceivedNodes.find((oldNode) => oldNode.id === nodeData.id);
          if (!existingNode) {
            newOrChangedMqttMessageReceivedNodes.push(nodeData);
          } else if (
            existingNode.data.topic !== nodeData.data.topic ||
            existingNode.data.serverId !== nodeData.data.serverId
          ) {
            newOrChangedMqttMessageReceivedNodes.push(nodeData);
          }
        }

        if (nodeData.type === ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE) {
          const existingNode = oldMqttWaitForMessageNodes.find((oldNode) => oldNode.id === nodeData.id);
          if (!existingNode) {
            newOrChangedMqttWaitForMessageNodes.push(nodeData);
          } else if (
            existingNode.data.topic !== nodeData.data.topic ||
            existingNode.data.serverId !== nodeData.data.serverId
          ) {
            newOrChangedMqttWaitForMessageNodes.push(nodeData);
          }
        }
      }

      // Delete existing nodes and edges (cascading will handle relationships)
      await transactionalEntityManager.delete(ResourceFlowNode, { resource: { id: resourceId } });
      await transactionalEntityManager.delete(ResourceFlowEdge, { resource: { id: resourceId } });

      // Create new nodes
      const newNodes = flowData.nodes.map((nodeData) => {
        const node = new ResourceFlowNode();
        node.id = nodeData.id;
        node.type = nodeData.type;
        node.position = {
          x: nodeData.position.x,
          y: nodeData.position.y,
        };
        node.data = nodeData.data || {};
        node.resource = resource;
        return node;
      });

      // Create new edges
      const newEdges = flowData.edges.map((edgeData) => {
        const edge = new ResourceFlowEdge();
        edge.id = edgeData.id;
        edge.source = edgeData.source;
        edge.sourceHandle = edgeData.sourceHandle;
        edge.target = edgeData.target;
        edge.targetHandle = edgeData.targetHandle;
        edge.resource = resource;
        return edge;
      });

      // Save all nodes and edges
      const [savedNodes, savedEdges] = await Promise.all([
        transactionalEntityManager.save(ResourceFlowNode, newNodes),
        transactionalEntityManager.save(ResourceFlowEdge, newEdges),
      ]);

      for (const nodeData of newOrChangedMqttMessageReceivedNodes) {
        if (!nodeData.data.serverId || !nodeData.data.topic) {
          this.logger.warn(
            `Skipping subscription to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId} because it is missing`,
          );
          continue;
        }
        this.mqttClientService
          .subscribe(nodeData.data.serverId as number, nodeData.data.topic as string)
          .catch((error) => {
            this.logger.error(
              `Failed to subscribe to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId}`,
              error.stack,
            );
          });
      }

      for (const nodeData of newOrChangedMqttWaitForMessageNodes) {
        if (!nodeData.data.serverId || !nodeData.data.topic) {
          this.logger.warn(
            `Skipping subscription to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId} because it is missing`,
          );
          continue;
        }
        this.mqttClientService
          .subscribe(nodeData.data.serverId as number, nodeData.data.topic as string)
          .catch((error) => {
            this.logger.error(
              `Failed to subscribe to topic ${nodeData.data.topic} for server ID ${nodeData.data.serverId}`,
              error.stack,
            );
          });
      }

      return { nodes: savedNodes, edges: savedEdges };
    });

    // Include validation errors in the response if any exist
    const response: ResourceFlowResponse = {
      nodes: result.nodes,
      edges: result.edges,
    };

    if (allValidationErrors.length > 0) {
      response.validationErrors = allValidationErrors;
    }

    this.eventEmitter.emit(ResourceFlowChangedEvent.EVENT_NAME, resourceId);

    return response;
  }

  async getResourceFlowLogs(resourceId: number, page = 1, limit = 50): Promise<PaginatedResponse<ResourceFlowLog>> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get logs with pagination, ordered by creation time (newest first)
    const [logs, total] = await this.flowLogRepository.findAndCount({
      where: { resourceId },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: logs,
      total,
      page,
      limit,
    };
  }

  public async getNodes(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return await this.flowNodeRepository.find({
      where: { resourceId, type },
    });
  }

  public async getNodeSchemas(resourceId: number): Promise<ResourceFlowNodeSchemaDto[]> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    return Object.values(ResourceFlowNodeType).map((type) => {
      const schema: ResourceFlowNodeSchemaDto = {
        type,
        configSchema: {},
        inputs: [],
        outputs: [],
        supportedByResource: false,
        isOutput: false,
      };

      switch (type) {
        case ResourceFlowNodeType.MANUAL_BUTTON:
          schema.configSchema = z.toJSONSchema(ButtonNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.RESOURCE_USAGE_TAKEOVER:
          schema.configSchema = z.toJSONSchema(EventNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.DOOR_UNLOCKED:
        case ResourceFlowNodeType.DOOR_LOCKED:
        case ResourceFlowNodeType.DOOR_UNLATCHED:
          schema.configSchema = z.toJSONSchema(EventNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Door;
          break;

        case ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED:
          schema.configSchema = z.toJSONSchema(MqttMessageReceivedNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.RESOURCE_ACTIVITY_NO_ACTIVITY:
          schema.configSchema = z.toJSONSchema(InputResourceActivityNoActivityNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
          schema.configSchema = z.toJSONSchema(BillingTransactionItemCreateSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.HTTP_SEND_REQUEST:
          schema.configSchema = z.toJSONSchema(HttpRequestNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.MQTT_SEND_MESSAGE:
          schema.configSchema = z.toJSONSchema(MqttSendMessageNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.RESOURCE_USAGE_END_SESSION:
          schema.configSchema = z.toJSONSchema(ResourceUsageEndSessionNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.RESOURCE_ACTIVITY_TRACK_ACTIVITY:
          schema.configSchema = z.toJSONSchema(ResourceActivityTrackActivityNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.LOGIC_WAIT:
          schema.configSchema = z.toJSONSchema(WaitNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.LOGIC_IF:
          schema.configSchema = z.toJSONSchema(IfNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output-true', 'output-false'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.LOGIC_SET_PAYLOAD:
          schema.configSchema = z.toJSONSchema(SetPayloadNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE:
          schema.configSchema = z.toJSONSchema(MqttWaitForMessageNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.LOGIC_ERROR:
          schema.configSchema = z.toJSONSchema(ErrorNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.HEALTH_HEARTBEAT:
          schema.configSchema = z.toJSONSchema(ResourceHealthHeartbeatNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.HEALTH_SET:
          schema.configSchema = z.toJSONSchema(ResourceHealthSetNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        default: {
          const exhaustiveCheck: never = type;
          throw new Error(`Unknown node type: ${exhaustiveCheck}`);
        }
      }

      return schema;
    });
  }
}
