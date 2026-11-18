import {
  FlowEdgeRecord,
  FlowNodeRecord,
  FlowScope,
  ResourceFlowNodeType,
  ResourceType,
  getNodeDataSchema,
} from '@attraccess/application-models';

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';

import { MqttClientService } from '../../mqtt/mqtt-client.service';

import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../audit/recorder/audit-event';

import { canvasSaveDetails, diffCanvas } from './flow-audit';

import { FLOW_GRAPH_STORE, FlowCanvasIdConflictError, FlowGraphStore } from './flow-graph.port';

import { FLOW_RESOURCE_DIRECTORY, FlowResourceDirectory } from './flow-resource-directory.port';

import { ResourceFlowResponseDto, ResourceFlowSaveDto } from './dto/index';

import { ResourceFlowChangedEvent } from './events/resource-flow-changed.event';

import { getPluginFlowNode, getRegisteredPluginFlowNodes } from '../../plugin-system/flows/node-registry';

import { findFlowsWithoutSessionCountCheck, SharedMachineFlowWarning } from './shared-machine-flow-warnings';

import { getCoreNodeSchemas } from './schemas/core-node-schemas';

import { ResourceFlowNodeSchemaDto } from './dto/resource-flow-node-schemas-response.dto';

import { getNodeFlowScopes } from './schemas/node-flow-scopes';

import type { TransactionScope } from '../../database/unit-of-work';

export interface ValidationError {
  nodeId: string;
  nodeType: string;
  field: string;
  message: string;
  value?: unknown;
}

export interface ResourceFlowResponse {
  nodes: FlowNodeRecord[];
  edges: FlowEdgeRecord[];
  validationErrors?: ValidationError[];
}

@Injectable()
export class ResourceFlowsService {
  constructor(
    @Inject(FLOW_GRAPH_STORE) protected readonly graph: FlowGraphStore,
    @Inject(FLOW_RESOURCE_DIRECTORY) protected readonly resources: FlowResourceDirectory,
    protected readonly mqttClientService: MqttClientService,
    protected readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(ResourceFlowsService.name);

  public async getResourceFlow(resourceId: number): Promise<ResourceFlowResponse> {
    // Verify resource exists
    if (!(await this.resources.find(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }

    // Get all nodes and edges for the resource
    const { nodes, edges } = await this.graph.loadResourceCanvas(resourceId);

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

  /** Flows that switch something on every start or stop without looking at how many people are using the machine. */
  public async getSharedMachineFlowWarnings(resourceId: number): Promise<SharedMachineFlowWarning[]> {
    if (!(await this.resources.find(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }
    const { nodes, edges } = await this.graph.loadResourceCanvas(resourceId);
    const warnings = findFlowsWithoutSessionCountCheck(nodes, edges);

    // Enabled global flows run for this machine's starts and stops too.
    for (const { flow, canvas } of await this.graph.loadEnabledGlobalCanvases()) {
      warnings.push(...findFlowsWithoutSessionCountCheck(canvas.nodes, canvas.edges, flow));
    }
    return warnings;
  }

  /** The 400 response for a canvas that uses ids another flow owns (node and edge ids are global). */
  public canvasIdConflict(error: FlowCanvasIdConflictError): BadRequestException {
    return new BadRequestException({
      message: [
        ...error.nodeIds.map((id) => `Node id ${id} is already used by another flow`),
        ...error.edgeIds.map((id) => `Edge id ${id} is already used by another flow`),
      ],
      error: 'Bad Request',
      statusCode: 400,
      nodeIds: error.nodeIds,
      edgeIds: error.edgeIds,
    });
  }

  /** Rejects a canvas that contains a node the flow's scope cannot use; the error names every such node. */
  public assertNodesSupportScope(nodes: { id: string; type: string }[], scope: FlowScope): void {
    const unsupported = nodes.filter((node) => {
      const scopes = getNodeFlowScopes(node.type);
      // Unknown types are reported by the regular node validation.
      return scopes !== undefined && !scopes.includes(scope);
    });
    if (unsupported.length > 0) {
      throw new BadRequestException({
        message: unsupported.map(
          (node) =>
            `Node ${node.id} (${node.type}) cannot be used in ${scope === 'global' ? 'global' : 'resource'} flows`,
        ),
        error: 'Bad Request',
        statusCode: 400,
        nodes: unsupported.map((node) => ({ nodeId: node.id, nodeType: node.type })),
      });
    }
  }

  /** Subscribes to the topics of MQTT nodes that are new or changed compared to the stored ones. */
  public subscribeToChangedMqttNodes(
    oldNodes: { id: string; type: string; data: Record<string, unknown> }[],
    newNodes: { id: string; type: string; data: Record<string, unknown> }[],
  ): void {
    for (const node of newNodes) {
      if (
        node.type !== ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED &&
        node.type !== ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE
      ) {
        continue;
      }
      const existing = oldNodes.find((old) => old.id === node.id);
      if (existing && existing.data.topic === node.data.topic && existing.data.serverId === node.data.serverId) {
        continue;
      }
      this.subscribeToNodeTopic(node.data);
    }
  }

  public subscribeToNodeTopic(data: Record<string, unknown>): void {
    if (!data.serverId || !data.topic) {
      this.logger.warn(
        `Skipping subscription to topic ${data.topic} for server ID ${data.serverId} because it is missing`,
      );
      return;
    }
    this.mqttClientService.subscribe(data.serverId as number, data.topic as string).catch((error) => {
      this.logger.error(`Failed to subscribe to topic ${data.topic} for server ID ${data.serverId}`, error.stack);
    });
  }

  /** With `scope`, the read joins that transaction (a lifecycle transaction must not read through the main connection). */
  public async getNodes(
    resourceId: number,
    type: ResourceFlowNodeType,
    scope?: TransactionScope,
  ): Promise<FlowNodeRecord[]> {
    return await this.graph.findResourceNodes(resourceId, type, scope);
  }

  public async getNodesForResources(
    resourceIds: number[],
    type: ResourceFlowNodeType,
  ): Promise<Map<number, FlowNodeRecord[]>> {
    const map = new Map<number, FlowNodeRecord[]>(resourceIds.map((id) => [id, []]));
    const nodes = await this.graph.findNodesForResources(resourceIds, type);
    for (const node of nodes) {
      const bucket = map.get(node.resourceId as number);
      if (bucket) bucket.push(node);
    }
    return map;
  }

  async saveResourceFlow(
    resourceId: number,
    flowData: ResourceFlowSaveDto,
    actor: AuditActor,
  ): Promise<ResourceFlowResponseDto> {
    // Verify resource exists
    if (!(await this.resources.find(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }

    this.assertNodesSupportScope(flowData.nodes, 'resource');

    // Collect validation errors from all nodes
    const allValidationErrors: ValidationError[] = [];
    const validationContext = new Map<string, unknown>([['meterResourceId', resourceId]]);
    for (const nodeData of flowData.nodes) {
      const nodeErrors = await this.validateNodeData(nodeData, validationContext);
      allValidationErrors.push(...nodeErrors);
    }

    // The canvas is replaced atomically, together with its audit row.
    let result: Awaited<ReturnType<FlowGraphStore['replaceResourceCanvas']>>;
    try {
      result = await this.graph.replaceResourceCanvas(resourceId, flowData, (previous) => {
        const diff = diffCanvas(previous, flowData);
        return diff
          ? {
              domain: 'resource',
              action: 'resource_flow.updated',
              actor,
              subject: { type: 'resource', id: resourceId },
              details: canvasSaveDetails(previous, flowData, diff),
            }
          : undefined;
      });
    } catch (error) {
      if (error instanceof FlowCanvasIdConflictError) throw this.canvasIdConflict(error);
      throw error;
    }

    // Topics of new or changed MQTT nodes are subscribed once the canvas is committed.
    this.subscribeToChangedMqttNodes(result.previous.nodes, flowData.nodes);

    // Include validation errors in the response if any exist
    const response: ResourceFlowResponse = {
      nodes: result.saved.nodes,
      edges: result.saved.edges,
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
    if (!(await this.resources.find(resourceId))) {
      throw new ResourceNotFoundException(resourceId);
    }

    return this.resolvePluginNodeSchema(nodeType, config, { flowScope: 'resource', resourceId, flowId: null }, purpose);
  }

  /** Builds a plugin node's schema for the given flow; shared by resource and global flows. */
  public async resolvePluginNodeSchema(
    nodeType: string,
    config: Record<string, unknown>,
    flow: { flowScope: FlowScope; resourceId: number | null; flowId: number | null },
    purpose: 'editor' | 'preview' = 'editor',
  ): Promise<ResourceFlowNodeSchemaDto> {
    const definition = getPluginFlowNode(nodeType);
    if (!definition) {
      throw new NotFoundException(`Plugin flow node type "${nodeType}" was not found.`);
    }
    if (!(getNodeFlowScopes(nodeType) ?? []).includes(flow.flowScope)) {
      throw new BadRequestException(`Plugin flow node type "${nodeType}" cannot be used in ${flow.flowScope} flows.`);
    }

    const configSchema = definition.resolveConfigSchema
      ? await definition.resolveConfigSchema(config, purpose === 'preview' ? { ...flow, purpose } : flow)
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

  public async validateNodeData(
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
      meterIds = this.resources.meterIds(resourceId).then((ids) => new Set(ids));
      // Share the pending lookup with concurrent validators; each flow request has a fresh context.
      validationContext.set(cacheKey, meterIds);
    }
    return meterIds;
  }

  /** Pass the resource id for a resource flow; global flows have no resource and get every node, marked by scope. */
  public async getNodeSchemas(resourceId?: number): Promise<ResourceFlowNodeSchemaDto[]> {
    let resourceType: ResourceType | undefined;
    let accessOnly = false;
    if (resourceId !== undefined) {
      const resource = await this.resources.find(resourceId);

      if (!resource) {
        throw new ResourceNotFoundException(resourceId);
      }
      resourceType = resource.type;
      accessOnly = resource.accessOnly;
    }

    const coreSchemas = getCoreNodeSchemas(resourceType, accessOnly);

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

  public pluginNodeSchema(
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
      supportedFlowScopes: getNodeFlowScopes(definition.type) ?? [],
      isOutput: definition.isOutput ?? false,
      isInput: definition.isInput ?? false,
    };
  }
}
