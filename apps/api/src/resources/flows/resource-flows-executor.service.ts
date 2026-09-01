import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, EntityTarget, MoreThan } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  Resource,
  ResourceUsageAction,
  ResourceUsage,
  BillingTransactionItem,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSource,
  ResourceHealthStatus,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
  getExternalEffectFailureBehavior,
} from '@attraccess/database-entities';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ResourceFlowLogType } from './dto/flow-log.dto';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { randomBytes } from 'crypto';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import Handlebars from 'handlebars';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import z from 'zod';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceHealthService } from '../health/resource-health.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { getPluginFlowNode, getPluginFlowNodeOwner } from '../../plugin-system/plugin-flow-node-registry';
import {
  ActivityTrackExecutor,
  BillingSetAdditionalItemsExecutor,
  CompanionLockPcExecutor,
  CompanionUnlockPcExecutor,
  EndUsageSessionExecutor,
  ErrorExecutor,
  GetVariablesExecutor,
  HealthHeartbeatExecutor,
  HealthSetExecutor,
  HttpSendRequestExecutor,
  IfExecutor,
  MqttSendMessageExecutor,
  MqttWaitForMessageExecutor,
  OperatingTransitionExecutor,
  NodeExecutionContext,
  NodeExecutor,
  NodeProcessingResult,
  PassthroughExecutor,
  SetPayloadExecutor,
  SetVariablesExecutor,
  TemplateVariables,
  WaitExecutor,
  heartbeatKey,
  topicMatches,
} from './node-executors';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { ExternalEffectFailureError } from './errors/external-effect-failure.error';

// Handlebars helpers
Handlebars.registerHelper('json', (value: unknown) => {
  try {
    return new Handlebars.SafeString(JSON.stringify(value));
  } catch {
    return 'null';
  }
});

interface UsageEventData {
  resource: {
    id: number;
    name: string;
    metadata?: Record<string, unknown> | null;
  };
  event: {
    timestamp: string;
  };
  usage: {
    start: string;
    end: string;
  };
  user: {
    id: number;
    username: string;
    externalIdentifier: string;
  };
  previousUser?: {
    id: number;
    username: string;
    externalIdentifier: string;
  };
}

interface FlowResourceContext {
  id: number;
  name?: string;
  type?: Resource['type'];
  metadata?: Resource['metadata'];
}

@Injectable()
export class ResourceFlowsExecutorService implements OnModuleInit {
  private readonly logger = new Logger(ResourceFlowsExecutorService.name);

  private readonly resourceActivity: Map<Resource['id'], Date> = new Map();
  private readonly heartbeatLastSeen: Map<string, Date> = new Map();

  private readonly templateVariables = new WeakMap<object, TemplateVariables>();

  /**
   * Registry mapping every flow node type to its executor strategy. Declaring it
   * as a `Record` keyed by the enum keeps node-type coverage exhaustive at
   * compile time (a missing type is a type error).
   */
  private readonly nodeExecutors: Record<ResourceFlowNodeType, NodeExecutor>;

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    private readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly flowLogs: FlowLogRecorderService,
    private readonly mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    private readonly resourceUsageService: ResourceUsageService,
    @InjectRepository(BillingTransactionItem)
    private readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
    private readonly eventEmitter: EventEmitter2,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly variablesService: ResourceFlowVariablesService,
    private readonly cronTimer: CronTimer,
    private readonly flowTimer: FlowTimer,
    private readonly companionGatewayService: CompanionGatewayService,
    private readonly operatingIntervals: ResourceOperatingIntervalService,
  ) {
    this.nodeExecutors = this.buildNodeExecutorRegistry();
  }

  /**
   * Instantiates one executor per node type. Trigger/input nodes share a single
   * passthrough executor; the rest receive only the collaborators they need.
   * Executors are plain (non-DI) objects so the service keeps its DI signature.
   */
  private buildNodeExecutorRegistry(): Record<ResourceFlowNodeType, NodeExecutor> {
    const passthrough = new PassthroughExecutor();

    return {
      [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED]: passthrough,
      [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED]: passthrough,
      [ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER]: passthrough,
      [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED]: passthrough,
      [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED]: passthrough,
      [ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED]: passthrough,
      [ResourceFlowNodeType.INPUT_BUTTON]: passthrough,
      [ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED]: passthrough,
      [ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY]: passthrough,
      [ResourceFlowNodeType.INPUT_VARIABLE_CHANGED]: passthrough,

      [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT]: new HealthHeartbeatExecutor(
        this.resourceHealthService,
        this.heartbeatLastSeen,
      ),
      [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET]: new HealthSetExecutor(this.resourceHealthService),
      [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS]: new BillingSetAdditionalItemsExecutor(
        this.resourceUsageService,
        this.billingTransactionItemRepository,
      ),
      [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST]: new HttpSendRequestExecutor(),
      [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE]: new MqttSendMessageExecutor(this.mqttClientService),
      [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION]: new EndUsageSessionExecutor(this.resourceUsageService),
      [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY]: new ActivityTrackExecutor(this.resourceActivity),
      [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING]: new OperatingTransitionExecutor(
        this.operatingIntervals,
        'operating',
      ),
      [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE]: new OperatingTransitionExecutor(this.operatingIntervals, 'idle'),

      [ResourceFlowNodeType.PROCESSING_WAIT]: new WaitExecutor(),
      [ResourceFlowNodeType.PROCESSING_IF]: new IfExecutor(),
      [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD]: new SetPayloadExecutor(),
      [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE]: new MqttWaitForMessageExecutor(
        this.mqttClientService,
        this.eventEmitter,
      ),
      [ResourceFlowNodeType.PROCESSING_ERROR]: new ErrorExecutor(),
      [ResourceFlowNodeType.PROCESSING_SET_VARIABLES]: new SetVariablesExecutor(this.variablesService),
      [ResourceFlowNodeType.PROCESSING_GET_VARIABLES]: new GetVariablesExecutor(this.variablesService),

      [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC]: new CompanionLockPcExecutor(this.companionGatewayService),
      [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC]: new CompanionUnlockPcExecutor(this.companionGatewayService),
      [ResourceFlowNodeType.INPUT_COMPANION_IDLE]: passthrough,
      [ResourceFlowNodeType.INPUT_COMPANION_ACTIVE]: passthrough,
      [ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED]: passthrough,
      [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED]: passthrough,
      [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED]: passthrough,
    };
  }

  async onModuleInit() {
    await this.subscribeToMqttTopics();
  }

  private async subscribeToMqttTopics() {
    const [mqttMessageReceivedNodes, mqttWaitForMessageNodes] = await Promise.all([
      this.flowNodeRepository.find({
        where: { type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED },
      }),
      this.flowNodeRepository.find({
        where: { type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE },
      }),
    ]);

    const subscribePairs: Array<{ serverId: number; topic: string; qos?: 0 | 1 | 2 }> = [];

    for (const node of mqttMessageReceivedNodes) {
      const { topic, serverId } = node.data as z.infer<typeof MqttMessageReceivedNodeDataSchema>;
      if (!serverId || !topic) {
        this.logger.warn(`Skipping subscription to topic ${topic} for server ID ${serverId} because it is missing`);
        continue;
      }
      subscribePairs.push({ serverId, topic });
    }

    for (const node of mqttWaitForMessageNodes) {
      const { topic, serverId, subscribeQos } = node.data as z.infer<typeof MqttWaitForMessageNodeDataSchema>;
      if (!serverId || !topic) {
        this.logger.warn(`Skipping subscription to topic ${topic} for server ID ${serverId} because it is missing`);
        continue;
      }
      subscribePairs.push({ serverId, topic, qos: subscribeQos as unknown as 0 | 1 | 2 });
    }

    for (const { serverId, topic, qos } of subscribePairs) {
      await this.mqttClientService.subscribe(serverId, topic, qos).catch((error) => {
        this.logger.error(`Failed to subscribe to topic ${topic} for server ID ${serverId}`, error.stack);
      });
    }
  }

  private getRepository<T>(
    entity: EntityTarget<T>,
    defaultRepository: Repository<T>,
    transactionManager?: EntityManager,
  ): Repository<T> {
    return transactionManager ? transactionManager.getRepository<T>(entity) : defaultRepository;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private async getResourceContext(
    resourceId: number,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<FlowResourceContext> {
    const cached = cache?.get(resourceId);
    if (cached) {
      return cached;
    }

    const repository = this.getRepository(Resource, this.resourceRepository, transactionManager);
    const resource = await repository.findOne({ where: { id: resourceId } });

    const context: FlowResourceContext = {
      id: resourceId,
      name: resource?.name,
      type: resource?.type,
      metadata: resource?.metadata ?? null,
    };

    cache?.set(resourceId, context);

    return context;
  }

  private async withResourceContext(
    resourceId: number,
    payload: unknown,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<unknown> {
    if (!this.isPlainObject(payload)) {
      return payload;
    }

    const context = await this.getResourceContext(resourceId, transactionManager, cache);
    const variables = await this.variablesService.getAll(resourceId);
    const payloadRecord = payload as Record<string, unknown>;
    const existingResource = payloadRecord.resource;

    let result: Record<string, unknown>;
    if (this.isPlainObject(existingResource)) {
      const existingMetadata = (existingResource as Record<string, unknown>).metadata;
      const metadata = existingMetadata ?? context.metadata ?? null;

      result = {
        ...payloadRecord,
        resource: {
          ...(existingResource as Record<string, unknown>),
          ...context,
          metadata,
        },
      };
    } else {
      result = {
        ...payloadRecord,
        resource: context,
      };
    }

    this.templateVariables.set(result, variables);
    return result;
  }

  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  async handleResourceSessionStartedEvent(event: ResourceSessionStartedEvent) {
    try {
      const { usage } = event;

      switch (usage.usageAction) {
        case ResourceUsageAction.Usage:
          // handled by the resource usage service
          break;
        case ResourceUsageAction.DoorLock:
          // TODO: directly trigger the flow instead of relying on the event emitter
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED);
          break;
        case ResourceUsageAction.DoorUnlock:
          // TODO: directly trigger the flow instead of relying on the event emitter
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED);
          break;
        case ResourceUsageAction.DoorUnlatch:
          // TODO: directly trigger the flow instead of relying on the event emitter
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED);
          break;

        default: {
          const exhaustiveCheck: never = usage.usageAction;
          throw new Error(`Unknown resource usage action: ${exhaustiveCheck}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to handle resource usage event`, error.stack);
      throw error;
    }
  }

  @OnEvent(MqttMessageReceivedEvent.EVENT_NAME)
  async handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent) {
    const { topic, payload, serverId } = event;

    const messageReceivedNodes = await this.flowNodeRepository.find({
      where: {
        type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      },
    });

    const filteredMessageReceivedNodes = messageReceivedNodes.filter((node) => {
      const { serverId: nodeServerId, topic: nodeTopic } = MqttMessageReceivedNodeDataSchema.parse(node.data);
      return nodeServerId === serverId && (topicMatches(nodeTopic, topic) || topicMatches(topic, nodeTopic));
    });

    if (filteredMessageReceivedNodes.length === 0) {
      this.logger.debug(`No flow nodes found for server ID: ${serverId} and topic: ${topic}`);
      return;
    }

    this.logger.log(`Found ${filteredMessageReceivedNodes.length} flow node(s) for topic: ${topic}`);

    await this.startFlow(filteredMessageReceivedNodes, { payload: { serverId, topic, payload } });
  }

  private async handleResourceUsage(usage: ResourceUsage, inputType: ResourceFlowNodeType) {
    const { resource } = usage;

    this.logger.log(`Handling resource usage event for resource ID: ${resource.id}`);

    try {
      await this.triggerResourceUsageNode(resource.id, inputType, {
        event: {
          timestamp: (usage.endTime ?? usage.startTime)?.toISOString(),
        },
        usage: {
          start: usage.startTime.toISOString(),
          end: usage.endTime ? usage.endTime.toISOString() : null,
        },
        user: {
          id: usage.user.id,
          username: usage.user.username,
          externalIdentifier: usage.user.externalIdentifier,
        },
        resource: {
          id: usage.resource.id,
          name: usage.resource.name,
          metadata: usage.resource.metadata ?? null,
        },
      });
      this.logger.log(`Successfully processed resource usage event for resource ID: ${resource.id}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage event for resource ID: ${resource.id}`, error.stack);
      throw error;
    }
  }

  private async triggerResourceUsageNode(
    resourceId: number,
    eventType: ResourceFlowNodeType,
    eventData: UsageEventData,
  ) {
    this.logger.debug(`Looking for flow nodes of type '${eventType}' for resource ID: ${resourceId}`);

    const eventNodes = await this.flowNodeRepository.find({
      where: {
        resourceId,
        type: eventType,
      },
    });

    if (eventNodes.length === 0) {
      this.logger.debug(`No flow nodes found for event type '${eventType}' and resource ID: ${resourceId}`);
      return;
    }

    this.logger.log(
      `Found ${eventNodes.length} flow node(s) for event type '${eventType}' and resource ID: ${resourceId}`,
    );

    await this.startFlow(eventNodes, { payload: eventData });
  }

  public async runFlow(
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    initialData: object = {},
    transactionManager?: EntityManager,
  ): Promise<object[]> {
    const repository = this.getRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

    const nodes = await repository.find({
      where: {
        resourceId,
        type: triggerNodeType,
      },
    });

    if (nodes.length === 0) {
      this.logger.debug(
        `No flow nodes found for trigger node type '${triggerNodeType}' and resource ID: ${resourceId}`,
      );
      return [];
    }

    // TODO: propagate errors so when calling runFlow you can react to them and they dont get ignored
    const results = await this.startFlow(nodes, { payload: initialData }, transactionManager);
    return results.map((r) => r.payload);
  }

  /**
   * Starts every plugin trigger node whose saved configuration matches an
   * external plugin event. Each node is started independently so its run logs
   * remain attributed to that node's resource.
   */
  public async triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>) => boolean,
    payload: object,
  ): Promise<void> {
    const definition = getPluginFlowNode(nodeType);
    if (
      !nodeType.startsWith(`plugin.${pluginName}.`) ||
      !definition?.isInput ||
      getPluginFlowNodeOwner(nodeType) !== pluginName
    ) {
      throw new Error(`Plugin flow node type "${nodeType}" is not a registered trigger node.`);
    }

    const pageSize = 100;
    const concurrency = 10;
    let lastId: string | undefined;
    for (;;) {
      const nodes = await this.flowNodeRepository.find({
        where: {
          type: nodeType as ResourceFlowNodeType,
          ...(lastId ? { id: MoreThan(lastId) } : {}),
        },
        order: { id: 'ASC' },
        take: pageSize,
      });

      if (nodes.length === 0) return;
      lastId = nodes[nodes.length - 1].id;

      for (let offset = 0; offset < nodes.length; offset += concurrency) {
        await Promise.allSettled(nodes.slice(offset, offset + concurrency).map(async (node) => {
          let isMatch: boolean;
          try {
            isMatch = matches(node.data as Record<string, unknown>);
          } catch (error) {
            this.logger.error(
              `Failed to match plugin flow trigger node ID: ${node.id} (Type: ${nodeType})`,
              error instanceof Error ? error.stack : undefined,
            );
            return;
          }

          if (isMatch) {
            await this.startFlow(node, { payload });
          }
        }));
      }

      if (nodes.length < pageSize) return;
    }
  }

  public async startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
  ): Promise<NodeProcessingResult[]> {
    const nodes = Array.isArray(node) ? node : [node];

    return this.flowTimer.timeFlow(nodes[0].type, async () => {
      this.logger.debug(`Processing nodes: ${nodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

      const flowRunId = `${randomBytes(3).toString('base64url').slice(0, 3)}-${randomBytes(3)
        .toString('base64url')
        .slice(0, 3)}-${randomBytes(3).toString('base64url').slice(0, 3)}`;

      this.flowLogs.record({
        flowRunId,
        nodeId: null,
        resourceId: nodes[0].resourceId,
        type: ResourceFlowLogType.FLOW_START,
      });

      let leafResults: NodeProcessingResult[] = [];
      try {
        const results = await Promise.all(
          nodes.map((node) => {
            return this.processNode(flowRunId, node, data, transactionManager, resourceContextCache);
          }),
        );
        leafResults = results.flat();
        this.logger.log(`Successfully processed all ${nodes.length} flow nodes`);
      } catch (error) {
        this.logger.error(`Failed to process flow nodes`, error.stack);
        throw error;
      } finally {
        this.flowLogs.record({
          flowRunId,
          nodeId: null,
          resourceId: nodes[0].resourceId,
          type: ResourceFlowLogType.FLOW_COMPLETED,
        });
      }
      return leafResults;
    });
  }

  /**
   * Builds the per-execution context handed to node executors. Exposes the
   * template helpers backed by the service-owned WeakMap so executors stay free
   * of Handlebars/variable plumbing.
   */
  private buildExecutionContext(transactionManager?: EntityManager): NodeExecutionContext {
    return {
      transactionManager,
      compileTemplate: (template, data) => this.compileTemplate(template, data),
      getTemplateVariables: (data) => this.templateVariables.get(data),
      setTemplateVariables: (data, variables) => this.templateVariables.set(data, variables),
    };
  }

  private async dispatchNode(
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    // Core node types are looked up in the exhaustive record.
    const executor = this.nodeExecutors[node.type as ResourceFlowNodeType];
    if (executor) {
      return executor.execute(node, input, this.buildExecutionContext(transactionManager));
    }

    // Plugin-contributed node types fall through to the plugin registry.
    const pluginNode = getPluginFlowNode(node.type);
    if (pluginNode) {
      if (pluginNode.isInput) {
        return { payload: input, outputHandle: 'output' };
      }
      return pluginNode.execute(
        { id: node.id, type: node.type, data: node.data as Record<string, unknown> },
        input,
        this.buildExecutionContext(transactionManager),
      );
    }

    throw new Error(`No executor found for flow node type: ${node.type}`);
  }

  private async processNode(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}`);

    const startTime = Date.now();

    let responseOfNode: NodeProcessingResult = { payload: {} };
    let dispatchStarted = false;

    try {
      // Log the start of node processing
      const input = (await this.withResourceContext(
        node.resourceId,
        resultOfPreviousNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
        payload: () => ({ input }),
      });

      dispatchStarted = true;
      responseOfNode = await this.flowTimer.timeNode(node.type, () =>
        this.dispatchNode(node, input, transactionManager),
      );

      const processingTime = Date.now() - startTime;
      this.logger.debug(`Successfully processed flow node ID: ${node.id} (Type: ${node.type}) in ${processingTime}ms`);

      responseOfNode.payload = (await this.withResourceContext(
        node.resourceId,
        responseOfNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_COMPLETED,
        payload: () => ({ output: responseOfNode.payload }),
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const failureBehavior = dispatchStarted ? getExternalEffectFailureBehavior(node.type, node.data) : undefined;
      const pluginNode = getPluginFlowNode(node.type);
      const pluginFailureBehavior =
        dispatchStarted && pluginNode && !pluginNode.isInput
          ? pluginNode.getFailureBehavior?.(node.data as Record<string, unknown>)
          : undefined;
      const failureKind = dispatchStarted
        ? (this.nodeExecutors[node.type]?.getFailureKind?.(error) ??
          (pluginNode && !pluginNode.isInput ? pluginNode.getFailureKind?.(error) : undefined) ??
          'node-failure')
        : 'node-failure';
      const errorMessage = this.errorReason(error);
      this.logger.error(
        `Failed to process flow node ID: ${node.id} (Type: ${node.type}) after ${processingTime}ms`,
        error instanceof Error ? error.stack : undefined,
      );

      this.flowLogs.record({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
        payload: () => ({ error: errorMessage, failureKind, failureBehavior: pluginFailureBehavior ?? failureBehavior ?? 'fail-flow' }),
      });

      const effectiveFailureBehavior = pluginFailureBehavior ?? failureBehavior;
      if (!effectiveFailureBehavior || effectiveFailureBehavior === 'fail-flow') {
        throw effectiveFailureBehavior === 'fail-flow' ? new ExternalEffectFailureError(errorMessage, error, failureKind) : error;
      }

      const payload =
        effectiveFailureBehavior === 'failure-output'
          ? { ...resultOfPreviousNode.payload, flowError: { kind: failureKind, message: errorMessage } }
          : resultOfPreviousNode.payload;
      responseOfNode = {
        payload,
        outputHandle: effectiveFailureBehavior === 'failure-output' ? 'failure' : 'output',
      };
    }

    return await this.executeNextNodes(flowRunId, node, responseOfNode, transactionManager, resourceContextCache);
  }

  private errorReason(error: unknown): string {
    if (error instanceof Error) {
      return error.message || error.name;
    }

    if (typeof error === 'string') {
      return error || 'Unknown error';
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message || 'Unknown error';
    }

    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== '{}' ? serialized : 'Unknown error';
    } catch {
      return String(error);
    }
  }

  private async executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Looking for outgoing edges from node ID: ${node.id} (Type: ${node.type})`);

    const edgesRepository = this.getRepository(ResourceFlowEdge, this.flowEdgeRepository, transactionManager);

    const edgesFromThisNode = await edgesRepository.find({
      where: {
        source: node.id,
        sourceHandle: resultOfPreviousNode.outputHandle,
      },
    });

    if (edgesFromThisNode.length === 0) {
      this.logger.debug(
        `No outgoing edges found from node ID: ${node.id} (Type: ${node.type}) - flow execution stops here`,
      );
      return [resultOfPreviousNode];
    }

    this.logger.debug(
      `Found ${edgesFromThisNode.length} outgoing edge(s) from node ID: ${node.id} (Type: ${node.type})`,
    );

    const flowNodeRepository = this.getRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

    // Execute each edge individually instead of deduplicating target nodes
    const edgePromises = edgesFromThisNode.map(async (edge) => {
      const targetNode = await flowNodeRepository.findOne({
        where: { id: edge.target },
      });

      if (!targetNode) {
        this.logger.warn(`Target node ${edge.target} not found for edge from node ${node.id}`);
        return [] as NodeProcessingResult[];
      }

      return this.processNode(flowRunId, targetNode, resultOfPreviousNode, transactionManager, resourceContextCache);
    });

    const results = await Promise.all(edgePromises);
    return results.flat();
  }

  public trackResourceActivity(resourceId: number) {
    this.resourceActivity.set(resourceId, new Date());
  }

  public getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined {
    return this.heartbeatLastSeen.get(heartbeatKey(resourceId, identifier));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkHealthHeartbeats() {
    const heartbeatNodes = await this.flowNodeRepository.find({
      where: { type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT },
    });

    const validKeys = new Set<string>();
    for (const node of heartbeatNodes) {
      const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success) {
        continue;
      }
      validKeys.add(heartbeatKey(node.resourceId, (parsed.data.identifier ?? '').trim()));
    }

    for (const key of this.heartbeatLastSeen.keys()) {
      if (!validKeys.has(key)) {
        this.heartbeatLastSeen.delete(key);
      }
    }

    if (heartbeatNodes.length === 0) {
      return;
    }

    const now = new Date();

    await Promise.all(
      heartbeatNodes.map(async (node) => {
        const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
        if (!parsed.success) {
          this.logger.warn(`Skipping heartbeat node ${node.id} with invalid data: ${parsed.error.message}`);
          return;
        }

        const identifier = (parsed.data.identifier ?? '').trim();
        const timeoutMs = parsed.data.timeoutSeconds * 1000;
        const lastSeen = this.heartbeatLastSeen.get(heartbeatKey(node.resourceId, identifier));

        if (!lastSeen) {
          this.heartbeatLastSeen.set(heartbeatKey(node.resourceId, identifier), now);
          return;
        }

        const elapsed = now.getTime() - lastSeen.getTime();
        if (elapsed < timeoutMs) {
          return;
        }

        const reasonTemplate = (parsed.data.unhealthyReason ?? '').trim();
        const reason = reasonTemplate.length > 0 ? reasonTemplate : 'Heartbeat timed out';

        await this.resourceHealthService.reportHealth({
          resourceId: node.resourceId,
          identifier,
          status: ResourceHealthStatus.UNHEALTHY,
          reason,
          source: ResourceHealthSource.HEARTBEAT,
          reportedAt: now,
        });
      }),
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkResourceActivity() {
    await this.cronTimer.time('flow_minute_tick', async () => {
      const now = new Date();

      const onResourceInactivityNodes = await this.flowNodeRepository
        .createQueryBuilder('node')
        .innerJoin(
          ResourceUsage,
          'usage',
          'usage.resourceId = node.resourceId AND usage.endTime IS NULL AND usage.isFinalized = TRUE AND usage.usageAction = :usageAction',
          { usageAction: ResourceUsageAction.Usage },
        )
        .where('node.type = :type', { type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY })
        .distinct(true)
        .getMany();

      await Promise.all(
        onResourceInactivityNodes.map(async (node) => {
          const parsedData = InputResourceActivityNoActivityNodeDataSchema.safeParse(node.data);
          if (!parsedData.success) {
            this.logger.warn(
              `Skipping resource inactivity node ${node.id} for resource flow of resource ${node.resourceId} because of invalid data: ${parsedData.error.message}`,
            );
            return;
          }

          const { minInactivityMinutes } = parsedData.data;

          const lastActivity = this.resourceActivity.get(node.resourceId);
          if (!lastActivity) {
            this.resourceActivity.set(node.resourceId, now);
            return;
          }

          const millisSinceLastActivity = now.getTime() - lastActivity.getTime();
          const minutesSinceLastActivity = millisSinceLastActivity / 1000 / 60;

          if (minutesSinceLastActivity < minInactivityMinutes) {
            return;
          }

          this.logger.debug(
            `Resource ${node.resourceId} has been inactive for ${minutesSinceLastActivity} minutes, triggering inactivity node`,
          );
          await this.startFlow(node, { payload: {} });

          this.resourceActivity.set(node.resourceId, now);
        }),
      );
    });
  }

  private compileTemplate(template: string, data: object): string {
    const variables = this.templateVariables.get(data);
    const dataWithVariables = variables ? { ...data, variables } : data;
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(dataWithVariables);
  }

  @OnEvent('companion.idle')
  async handleCompanionIdle(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_IDLE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  @OnEvent('companion.active')
  async handleCompanionActive(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_ACTIVE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  @OnEvent('companion.foreground_app')
  async handleCompanionForegroundApp(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED,
      event.payload,
      CompanionForegroundAppNodeDataSchema,
    );
  }

  @OnEvent('companion.usb_connected')
  async handleCompanionUsbConnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED,
      event.payload,
    );
  }

  @OnEvent('companion.usb_disconnected')
  async handleCompanionUsbDisconnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED,
      event.payload,
    );
  }

  private async triggerCompanionEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: object,
    schema: { safeParse: (d: unknown) => { success: boolean; data?: { deviceId: number } } },
  ): Promise<void> {
    const allNodes = await this.flowNodeRepository.find({ where: { type } });
    const matching = allNodes.filter((node) => {
      const parsed = schema.safeParse(node.data ?? {});
      return parsed.success && parsed.data?.deviceId === deviceId;
    });
    if (matching.length === 0) return;
    await this.startFlow(matching, { payload });
  }

  private async triggerUsbDeviceEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: CompanionUsbDeviceDto,
  ): Promise<void> {
    const allNodes = await this.flowNodeRepository.find({ where: { type } });
    const matching = allNodes.filter((node) => {
      const parsed = CompanionUsbDeviceNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success || parsed.data.deviceId !== deviceId) return false;
      const { vendorId, productId } = parsed.data;
      const hasVendorFilter = vendorId !== undefined;
      const hasProductFilter = productId !== undefined;
      if (hasVendorFilter && hasProductFilter) {
        return vendorId === payload.vendorId && productId === payload.productId;
      }
      if (hasVendorFilter) return vendorId === payload.vendorId;
      if (hasProductFilter) return productId === payload.productId;
      return true;
    });
    if (matching.length === 0) return;
    await this.startFlow(matching, { payload });
  }

  public async pressButton(resourceId: number, buttonId: string, executingUserId: number) {
    const activeResourceUsage = await this.resourceUsageService.getActiveSession(resourceId, false);

    if (
      !executingUserId ||
      !activeResourceUsage ||
      !activeResourceUsage.userId ||
      activeResourceUsage.userId !== executingUserId
    ) {
      throw new ForbiddenException('You are not allowed to press this button');
    }

    const button = await this.flowNodeRepository.findOne({
      where: {
        resourceId,
        type: ResourceFlowNodeType.INPUT_BUTTON,
        id: buttonId.toString(),
      },
    });

    if (!button) {
      throw new NotFoundException('UNKNOWN_BUTTON_ID', { cause: { buttonId } });
    }

    await this.startFlow(button, { payload: {} });
  }
}
