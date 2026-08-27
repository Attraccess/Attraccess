import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  Resource,
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
  ResourceOperatingTransitionNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  SetVariablesNodeDataSchema,
  GetVariablesNodeDataSchema,
  VariableChangedNodeDataSchema,
  CompanionLockNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
} from '@attraccess/database-entities';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceFlowSaveDto, ResourceFlowResponseDto } from './dto';
import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';
import { z } from 'zod';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getPluginFlowNode, getRegisteredPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';

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

  async resolveNodeSchema(
    resourceId: number,
    nodeType: string,
    config: Record<string, unknown>,
  ): Promise<ResourceFlowNodeSchemaDto> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    const definition = getPluginFlowNode(nodeType);
    if (!definition) {
      throw new NotFoundException(`Plugin flow node type "${nodeType}" was not found.`);
    }

    const configSchema = definition.resolveConfigSchema
      ? await definition.resolveConfigSchema(config)
      : definition.configSchema;
    if (!configSchema) {
      throw new Error(`Plugin flow node type "${nodeType}" does not provide a configuration schema.`);
    }

    return this.pluginNodeSchema(definition, configSchema);
  }

  private validateNodeData(nodeData: { id: string; type: string; data: unknown }): ValidationError[] {
    const errors: ValidationError[] = [];

    // Non-core types must belong to a registered plugin; reject unknown types at save time.
    if (!Object.values(ResourceFlowNodeType).includes(nodeData.type as ResourceFlowNodeType)) {
      if (!getPluginFlowNode(nodeData.type)) {
        errors.push({
          nodeId: nodeData.id,
          nodeType: nodeData.type,
          field: 'type',
          message: `Unknown node type: ${nodeData.type}`,
        });
      }
      // Plugin owns its own data validation — skip core schema check regardless.
      return errors;
    }

    try {
      const schema = getNodeDataSchema(nodeData.type as ResourceFlowNodeType);
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
          where: { resource: { id: resourceId }, type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED },
        }),
        transactionalEntityManager.find(ResourceFlowNode, {
          where: { resource: { id: resourceId }, type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE },
        }),
      ]);

      const newOrChangedMqttMessageReceivedNodes = [] as typeof flowData.nodes;
      const newOrChangedMqttWaitForMessageNodes = [] as typeof flowData.nodes;

      for (const nodeData of flowData.nodes) {
        if (nodeData.type === ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED) {
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

        if (nodeData.type === ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE) {
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
        node.type = nodeData.type as ResourceFlowNodeType;
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

  public async getNodes(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return await this.flowNodeRepository.find({
      where: { resourceId, type },
    });
  }

  public async getNodesForResources(
    resourceIds: number[],
    type: ResourceFlowNodeType,
  ): Promise<Map<number, ResourceFlowNode[]>> {
    const map = new Map<number, ResourceFlowNode[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const nodes = await this.flowNodeRepository.find({
      where: { resourceId: In(resourceIds), type },
    });
    for (const node of nodes) {
      const bucket = map.get(node.resourceId);
      if (bucket) bucket.push(node);
    }
    return map;
  }

  public async getNodeSchemas(resourceId: number): Promise<ResourceFlowNodeSchemaDto[]> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    const coreSchemas = Object.values(ResourceFlowNodeType).map((type) => {
      const schema: ResourceFlowNodeSchemaDto = {
        type,
        configSchema: {},
        inputs: [],
        outputs: [],
        supportedByResource: false,
        isOutput: false,
      };

      switch (type) {
        case ResourceFlowNodeType.INPUT_BUTTON:
          schema.configSchema = z.toJSONSchema(ButtonNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
          schema.configSchema = z.toJSONSchema(EventNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
          schema.configSchema = z.toJSONSchema(EventNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Door;
          break;

        case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
          schema.configSchema = z.toJSONSchema(MqttMessageReceivedNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY:
          schema.configSchema = z.toJSONSchema(InputResourceActivityNoActivityNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
          schema.configSchema = z.toJSONSchema(BillingTransactionItemCreateSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          break;

        case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
          schema.configSchema = z.toJSONSchema(HttpRequestNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output', 'failure'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
          schema.configSchema = z.toJSONSchema(MqttSendMessageNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output', 'failure'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION:
          schema.configSchema = z.toJSONSchema(ResourceUsageEndSessionNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output', 'failure'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY:
          schema.configSchema = z.toJSONSchema(ResourceActivityTrackActivityNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_OPERATING:
        case ResourceFlowNodeType.OUTPUT_RESOURCE_IDLE:
          schema.configSchema = z.toJSONSchema(ResourceOperatingTransitionNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = resource.type === ResourceType.Machine;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.PROCESSING_WAIT:
          schema.configSchema = z.toJSONSchema(WaitNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.PROCESSING_IF:
          schema.configSchema = z.toJSONSchema(IfNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output-true', 'output-false'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.PROCESSING_SET_PAYLOAD:
          schema.configSchema = z.toJSONSchema(SetPayloadNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE:
          schema.configSchema = z.toJSONSchema(MqttWaitForMessageNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output', 'failure'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.PROCESSING_ERROR:
          schema.configSchema = z.toJSONSchema(ErrorNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT:
          schema.configSchema = z.toJSONSchema(ResourceHealthHeartbeatNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET:
          schema.configSchema = z.toJSONSchema(ResourceHealthSetNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.INPUT_VARIABLE_CHANGED:
          schema.configSchema = z.toJSONSchema(VariableChangedNodeDataSchema, { io: 'input' });
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.PROCESSING_SET_VARIABLES:
          schema.configSchema = z.toJSONSchema(SetVariablesNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.PROCESSING_GET_VARIABLES:
          schema.configSchema = z.toJSONSchema(GetVariablesNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC:
        case ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC:
          schema.configSchema = z.toJSONSchema(CompanionLockNodeDataSchema, { io: 'input' });
          schema.inputs = ['input'];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          schema.isOutput = true;
          break;

        case ResourceFlowNodeType.INPUT_COMPANION_IDLE:
        case ResourceFlowNodeType.INPUT_COMPANION_ACTIVE:
          schema.configSchema = z.toJSONSchema(CompanionIdleActiveNodeDataSchema, { io: 'input' });
          schema.inputs = [];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED:
          schema.configSchema = z.toJSONSchema(CompanionForegroundAppNodeDataSchema, { io: 'input' });
          schema.inputs = [];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        case ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED:
        case ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED:
          schema.configSchema = z.toJSONSchema(CompanionUsbDeviceNodeDataSchema, { io: 'input' });
          schema.inputs = [];
          schema.outputs = ['output'];
          schema.supportedByResource = true;
          break;

        default: {
          const exhaustiveCheck: never = type;
          throw new Error(`Unknown node type: ${exhaustiveCheck}`);
        }
      }

      return schema;
    });

    // Append plugin-contributed node schemas.
    const pluginSchemas = getRegisteredPluginFlowNodes().map((definition) => {
      const configSchema = definition.configSchema ??
        (definition.resolveConfigSchema ? { dynamic: true, properties: {} } : undefined);
        if (!configSchema) {
          throw new Error(`Plugin flow node type "${definition.type}" does not provide a configuration schema.`);
        }
        return this.pluginNodeSchema(definition, configSchema);
    });

    return [...coreSchemas, ...pluginSchemas];
  }

  private pluginNodeSchema(
    definition: NonNullable<ReturnType<typeof getPluginFlowNode>>,
    configSchema: Record<string, unknown>,
  ): ResourceFlowNodeSchemaDto {
    return {
      type: definition.type,
      label: definition.label,
      description: definition.description,
      configSchema,
      inputs: definition.inputs,
      outputs: definition.outputs,
      supportedByResource: definition.supportedByAllResources !== false,
      isOutput: definition.isOutput ?? false,
    };
  }
}
