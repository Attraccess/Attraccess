import {
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  getNodeDataSchema,
} from '@attraccess/application-models';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { DatabaseTransactions } from '../../database/transaction-scope';

import { FLOW_WRITES, ResourceFlowPersistence } from './persistence/port';

import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

import { MqttClientService } from '../../mqtt/mqtt-client.service';

import { ResourceFlowResponseDto, ResourceFlowSaveDto } from './dto/index';

import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';

import { getPluginFlowNode, getRegisteredPluginFlowNodes } from '../../plugin-system/flows/node-registry';

import { getCoreNodeSchemas } from './schemas/core-node-schemas';

import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';

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
  constructor(
    protected readonly persistence: ResourceFlowPersistence,
    protected readonly transactions: DatabaseTransactions,
    protected readonly mqttClientService: MqttClientService,
    protected readonly eventEmitter: EventEmitter2,
  ) {}

  protected readonly logger = new Logger(ResourceFlowsService.name);

  public async getResourceFlow(resourceId: number): Promise<ResourceFlowResponse> {
    // Verify resource exists
    const resource = await this.persistence.findResource(resourceId);

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Get all nodes and edges for the resource
    const [nodes, edges] = await Promise.all([
      this.persistence.graphNodes(resourceId),
      this.persistence.graphEdges(resourceId),
    ]);

    const validationContext = new Map<string, unknown>([['meterResourceId', resourceId]]);
    const validationErrors: ValidationError[] = [];
    // Plugin validators may query external state, so bound the fanout without serializing the whole flow.
    const validationConcurrency = 4;
    for (let index = 0; index < nodes.length; index += validationConcurrency) {
      const batch = nodes.slice(index, index + validationConcurrency);
      validationErrors.push(
        ...(await Promise.all(batch.map((node) => this.validateNodeData(node, validationContext)))).flat(),
      );
    }
    return { nodes, edges, ...(validationErrors.length ? { validationErrors } : {}) };
  }

  public async getNodes(resourceId: number, type: ResourceFlowNodeType): Promise<ResourceFlowNode[]> {
    return await this.persistence.nodesByType([resourceId], type);
  }

  public async getNodesForResources(
    resourceIds: number[],
    type: ResourceFlowNodeType,
  ): Promise<Map<number, ResourceFlowNode[]>> {
    const map = new Map<number, ResourceFlowNode[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const nodes = await this.persistence.nodesByType(resourceIds, type);
    for (const node of nodes) {
      const bucket = map.get(node.resourceId);
      if (bucket) bucket.push(node);
    }
    return map;
  }

  async saveResourceFlow(resourceId: number, flowData: ResourceFlowSaveDto): Promise<ResourceFlowResponseDto> {
    // Verify resource exists
    const resource = await this.persistence.findResource(resourceId);

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Collect validation errors from all nodes
    const allValidationErrors: ValidationError[] = [];
    const validationContext = new Map<string, unknown>([['meterResourceId', resourceId]]);
    for (const nodeData of flowData.nodes) {
      const nodeErrors = await this.validateNodeData(nodeData, validationContext);
      allValidationErrors.push(...nodeErrors);
    }

    // Start transaction to ensure data consistency
    const result = await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (scope) => {
      const operations = scope.resolve(FLOW_WRITES);
      const [oldMqttMessageReceivedNodes, oldMqttWaitForMessageNodes] = await Promise.all([
        operations.nodesByType(resourceId, ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED),
        operations.nodesByType(resourceId, ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE),
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

      const { nodes: savedNodes, edges: savedEdges } = await operations.replaceGraph(
        resource,
        flowData.nodes.map((node) => ({
          id: node.id,
          type: node.type as ResourceFlowNodeType,
          position: { x: node.position.x, y: node.position.y },
          data: node.data || {},
        })),
        flowData.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: edge.target,
          targetHandle: edge.targetHandle,
        })),
      );

      scope.afterCommit(() => {
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
      });
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

  async resolveNodeSchema(
    resourceId: number,
    nodeType: string,
    config: Record<string, unknown>,
    purpose: 'editor' | 'preview' = 'editor',
  ): Promise<ResourceFlowNodeSchemaDto> {
    const resource = await this.persistence.findResource(resourceId);
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    const definition = getPluginFlowNode(nodeType);
    if (!definition) {
      throw new NotFoundException(`Plugin flow node type "${nodeType}" was not found.`);
    }

    const configSchema = definition.resolveConfigSchema
      ? await definition.resolveConfigSchema(config, purpose === 'preview' ? { resourceId, purpose } : { resourceId })
      : definition.configSchema;
    if (!configSchema) {
      throw new Error(`Plugin flow node type "${nodeType}" does not provide a configuration schema.`);
    }

    return this.pluginNodeSchema(
      definition,
      purpose === 'preview'
        ? { dynamic: true, type: 'object', properties: {}, preview: configSchema.preview ?? [] }
        : configSchema,
    );
  }

  protected async validateNodeData(
    nodeData: { id: string; type: string; data: unknown },
    validationContext = new Map<string, unknown>(),
  ): Promise<ValidationError[]> {
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
      const plugin = getPluginFlowNode(nodeData.type);
      if (plugin?.validateConfig) {
        const validationErrors = await plugin.validateConfig(
          nodeData.data as Record<string, unknown>,
          validationContext,
        );
        errors.push(
          ...validationErrors.map((error) => ({
            nodeId: nodeData.id,
            nodeType: nodeData.type,
            ...error,
          })),
        );
      }
      return errors;
    }

    try {
      const schema = getNodeDataSchema(nodeData.type as ResourceFlowNodeType);
      const data = schema.parse(nodeData.data);
      if (nodeData.type.includes('.resource.metering.') && data && typeof data === 'object' && 'meterId' in data) {
        const resourceId = validationContext.get('meterResourceId');
        if (
          typeof resourceId === 'number' &&
          !(await this.resourceMeterIds(resourceId, validationContext)).has(Number(data.meterId))
        ) {
          errors.push({
            nodeId: nodeData.id,
            nodeType: nodeData.type,
            field: 'meterId',
            message: 'Choose a meter belonging to this resource',
          });
        }
      }
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

  private resourceMeterIds(resourceId: number, validationContext: Map<string, unknown>): Promise<Set<number>> {
    const cacheKey = `resource-flow:meter-ids:${resourceId}`;
    let meterIds = validationContext.get(cacheKey) as Promise<Set<number>> | undefined;
    if (!meterIds) {
      meterIds = this.persistence.meterIds(resourceId).then((ids) => new Set(ids));
      // Share the pending lookup with concurrent validators; each flow request has a fresh context.
      validationContext.set(cacheKey, meterIds);
    }
    return meterIds;
  }

  public async getNodeSchemas(resourceId: number): Promise<ResourceFlowNodeSchemaDto[]> {
    const resource = await this.persistence.findResource(resourceId);

    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    const coreSchemas = getCoreNodeSchemas(resource.type);

    // Append plugin-contributed node schemas.
    const pluginSchemas = getRegisteredPluginFlowNodes().map((definition) => {
      const configSchema =
        definition.configSchema ?? (definition.resolveConfigSchema ? { dynamic: true, properties: {} } : undefined);
      if (!configSchema) {
        throw new Error(`Plugin flow node type "${definition.type}" does not provide a configuration schema.`);
      }
      return this.pluginNodeSchema(definition, configSchema);
    });

    return [...coreSchemas, ...pluginSchemas];
  }

  protected pluginNodeSchema(
    definition: NonNullable<ReturnType<typeof getPluginFlowNode>>,
    configSchema: Record<string, unknown>,
  ): ResourceFlowNodeSchemaDto {
    return {
      type: definition.type,
      label: definition.label,
      description: definition.description,
      configSchema,
      inputs: [...definition.inputs],
      outputs: [...definition.outputs],
      supportedByResource: definition.supportedByAllResources !== false,
      isOutput: definition.isOutput ?? false,
      isInput: definition.isInput ?? false,
    };
  }
}
