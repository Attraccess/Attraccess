import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, EntityManager, EntityTarget } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  ResourceFlowLog,
  ResourceFlowLogType,
  Resource,
  ResourceUsageAction,
  ResourceUsage,
  BillingTransactionItem,
  BillingTransactionItemCreateSchema,
  BillingTransaction,
  IfNodeDataSchema,
  WaitNodeDataSchema,
  HttpRequestNodeDataSchema,
  MqttSendMessageNodeDataSchema,
  SetPayloadNodeDataSchema,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceUsageEndSessionNodeDataSchema,
  ErrorNodeDataSchema,
  InputResourceActivityNoActivityNodeDataSchema,
  ResourceHealthHeartbeatNodeDataSchema,
  ResourceHealthSetNodeDataSchema,
  ResourceHealthSource,
  ResourceHealthStatus,
  HealthStateOptionEnum,
} from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageEvent } from '../usage/events/resource-usage.events';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FlowConfigType } from './flow.config';
import { Subject } from 'rxjs';
import { randomBytes } from 'crypto';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import axios from 'axios';
import Handlebars from 'handlebars';
import { get, set as lodashSet } from 'lodash-es';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import z from 'zod';
import { NoUsageSessionError } from './errors/no-usage-session.error';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FlowExecutionError } from './errors/flow-execution.error';
import { ResourceHealthService } from '../health/resource-health.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';

// Handlebars helpers
Handlebars.registerHelper('json', (value: unknown) => {
  try {
    return new Handlebars.SafeString(JSON.stringify(value));
  } catch {
    return 'null';
  }
});

export type ResourceFlowLogEvent = { data: ResourceFlowLog | { keepalive: true } };

interface NodeProcessingResult {
  payload: object;
  outputHandle?: string;
}

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
export class ResourceFlowsExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceFlowsExecutorService.name);
  private readonly logTTLDays: number;
  private keepAliveInterval: NodeJS.Timeout;

  private readonly resourceActivity: Map<Resource['id'], Date> = new Map();
  private readonly heartbeatLastSeen: Map<string, Date> = new Map();

  public readonly resourceFlowLogSubjects: Map<Resource['id'], Subject<ResourceFlowLogEvent>> = new Map();

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    private readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(ResourceFlowLog)
    private readonly flowLogRepository: Repository<ResourceFlowLog>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly configService: ConfigService,
    private readonly mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    private readonly resourceUsageService: ResourceUsageService,
    @InjectRepository(BillingTransactionItem)
    private readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
    private readonly eventEmitter: EventEmitter2,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly cronTimer: CronTimer,
    private readonly flowTimer: FlowTimer,
  ) {
    const flowConfig = this.configService.get<FlowConfigType>('flow');
    this.logTTLDays = flowConfig.FLOW_LOG_TTL_DAYS;
  }

  async onModuleInit() {
    // Send keep-alive messages every 30 seconds to prevent connection timeouts
    this.keepAliveInterval = setInterval(() => {
      this.resourceFlowLogSubjects.forEach((subject) => {
        subject.next({ data: { keepalive: true } });
      });
    }, 10000);

    await this.subscribeToMqttTopics();
  }

  onModuleDestroy() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.resourceFlowLogSubjects.forEach((subject) => subject.complete());
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

  private topicMatches(filter: string, topic: string): boolean {
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = filter.split('/').map((segment, index, arr) => {
      if (segment === '+') {
        return '[^/]+';
      }
      if (segment === '#' && index === arr.length - 1) {
        return '.*';
      }
      return escapeRegex(segment);
    });
    const pattern = '^' + parts.join('/') + '$';
    return new RegExp(pattern).test(topic);
  }

  private async createFlowLog(
    data: Omit<ResourceFlowLog, 'id' | 'createdAt' | 'resource'>,
    transactionManager?: EntityManager,
  ): Promise<ResourceFlowLog> {
    const logEntry = this.flowLogRepository.create(data);

    const repository = this.getRepository(ResourceFlowLog, this.flowLogRepository, transactionManager);

    try {
      const log = await repository.save(logEntry);
      if (!this.resourceFlowLogSubjects.has(log.resourceId)) {
        this.resourceFlowLogSubjects.set(log.resourceId, new Subject<ResourceFlowLogEvent>());
      }
      const subject = this.resourceFlowLogSubjects.get(log.resourceId);
      subject.next({ data: log });
      this.logger.debug(`Created flow log entry: ${log.id} for node: ${log.nodeId} (${log.type})`);
      return log;
    } catch (error) {
      this.logger.error(`Failed to create flow log entry for node: ${logEntry.nodeId}`, error.stack);
      throw error;
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
    const payloadRecord = payload as Record<string, unknown>;
    const existingResource = payloadRecord.resource;

    if (this.isPlainObject(existingResource)) {
      const existingMetadata = (existingResource as Record<string, unknown>).metadata;
      const metadata = existingMetadata ?? context.metadata ?? null;

      return {
        ...payloadRecord,
        resource: {
          ...(existingResource as Record<string, unknown>),
          ...context,
          metadata,
        },
      };
    }

    return {
      ...payloadRecord,
      resource: context,
    };
  }

  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupOldFlowLogs() {
    await this.cronTimer.time('flow_daily_cleanup', async () => {
      try {
        const cutoffDate = new Date(Date.now() - this.logTTLDays * 24 * 60 * 60 * 1000);

        this.logger.log(
          `Starting cleanup of flow logs older than ${this.logTTLDays} days (before ${cutoffDate.toISOString()})`,
        );

        const result = await this.flowLogRepository.delete({
          createdAt: LessThan(cutoffDate),
        });

        const deletedCount = result.affected || 0;
        this.logger.log(`Successfully cleaned up ${deletedCount} old flow log entries`);
      } catch (error) {
        this.logger.error('Failed to cleanup old flow logs', error.stack);
        throw error;
      }
    });
  }

  @OnEvent(ResourceUsageEvent.EVENT_NAME)
  async handleResourceUsageEvent(event: ResourceUsageEvent) {
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
      return nodeServerId === serverId && (this.topicMatches(nodeTopic, topic) || this.topicMatches(topic, nodeTopic));
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

  private async startFlow(
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

      await this.createFlowLog({
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
        await this.createFlowLog(
          {
            flowRunId,
            nodeId: null,
            resourceId: nodes[0].resourceId,
            type: ResourceFlowLogType.FLOW_COMPLETED,
          },
          transactionManager,
        );
      }
      return leafResults;
    });
  }

  private async dispatchNode(
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    switch (node.type) {
      case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
      case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
      case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
      case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
      case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
      case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
      case ResourceFlowNodeType.INPUT_BUTTON:
      case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
      case ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY:
        return { payload: input };

      case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT:
        return this.processHeartbeatNode(node, input);

      case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET:
        return this.processHealthSetNode(node, input);

      case ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
        return this.processBillingSetAdditionalItemsNode(node, input, transactionManager);

      case ResourceFlowNodeType.PROCESSING_WAIT:
        return this.processWaitNode(node, input, transactionManager);

      case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
        return this.processHttpSendRequestNode(node, input, transactionManager);

      case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
        return this.processMqttSendMessageNode(node, input, transactionManager);

      case ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION:
        return this.processEndUsageSessionNode(node, input, transactionManager);

      case ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY:
        return this.processActivityTrackActivityNode(node, input);

      case ResourceFlowNodeType.PROCESSING_IF:
        return this.processIfNode(node, input, transactionManager);

      case ResourceFlowNodeType.PROCESSING_SET_PAYLOAD:
        return this.processSetPayloadNode(node, input, transactionManager);

      case ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE:
        return this.processMqttWaitForMessageNode(node, input, transactionManager);

      case ResourceFlowNodeType.PROCESSING_ERROR:
        return this.processErrorNode(node, input, transactionManager);

      default: {
        const exhaustiveCheck: never = node.type;
        throw new Error(`Unknown node type: ${exhaustiveCheck}`);
      }
    }
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

    try {
      // Log the start of node processing
      const input = (await this.withResourceContext(
        node.resourceId,
        resultOfPreviousNode.payload,
        transactionManager,
        resourceContextCache,
      )) as object;

      await this.createFlowLog(
        {
          flowRunId,
          nodeId: node.id,
          resourceId: node.resourceId,
          type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
          payload: JSON.stringify({ input }),
        },
        transactionManager,
      );

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

      await this.createFlowLog(
        {
          flowRunId,
          nodeId: node.id,
          resourceId: node.resourceId,
          type: ResourceFlowLogType.NODE_PROCESSING_COMPLETED,
          payload: JSON.stringify({ output: responseOfNode.payload }),
        },
        transactionManager,
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Failed to process flow node ID: ${node.id} (Type: ${node.type}) after ${processingTime}ms`,
        error.stack,
      );

      await this.createFlowLog(
        {
          flowRunId,
          nodeId: node.id,
          resourceId: node.resourceId,
          type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
          payload: JSON.stringify({ error }),
        },
        transactionManager,
      );

      throw error;
    }

    return await this.executeNextNodes(flowRunId, node, responseOfNode, transactionManager, resourceContextCache);
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

  private async processWaitNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const { duration, unit } = node.data as z.infer<typeof WaitNodeDataSchema>;

    let waitDurationMs = duration * 1000;
    if (unit === 'minutes') {
      waitDurationMs *= 60;
    } else if (unit === 'hours') {
      waitDurationMs *= 60 * 60;
    }

    await new Promise((resolve) => setTimeout(resolve, waitDurationMs));

    return { payload: input };
  }

  private async processIfNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const {
      path,
      comparisonOperator,
      comparisonValue: comparisonValueTemplate,
      comparisonValueIsPath,
    } = node.data as z.infer<typeof IfNodeDataSchema>;

    const sourceValue = get(input, path, '');
    let comparisonValue = comparisonValueTemplate;

    if (comparisonValueIsPath) {
      comparisonValue = get(input, comparisonValue, '');
    }

    let result = false;
    switch (comparisonOperator) {
      case '=':
        result = String(comparisonValue) === String(sourceValue);
        break;
      case '!=':
        result = String(comparisonValue) !== String(sourceValue);
        break;
      case '>':
        result = Number(comparisonValue) > Number(sourceValue);
        break;
      case '<':
        result = Number(comparisonValue) < Number(sourceValue);
        break;
      case '>=':
        result = Number(comparisonValue) >= Number(sourceValue);
        break;
      case '<=':
        result = Number(comparisonValue) <= Number(sourceValue);
        break;
      default: {
        const exhaustiveCheck: never = comparisonOperator;
        throw new FlowExecutionError(`Unknown comparison operator: ${exhaustiveCheck}`);
      }
    }

    return {
      payload: input,
      outputHandle: result ? 'output-true' : 'output-false',
    };
  }

  private async processSetPayloadNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const { entries } = node.data as z.infer<typeof SetPayloadNodeDataSchema>;

    const newPayload: Record<string, unknown> = JSON.parse(JSON.stringify(input ?? {}));

    for (const entry of entries ?? []) {
      const compiledValue = this.compileTemplate(entry.value ?? '', input);
      lodashSet(newPayload, entry.key, compiledValue);
    }

    return { payload: newPayload };
  }

  private async processHttpSendRequestNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const data = node.data as z.infer<typeof HttpRequestNodeDataSchema>;

    const url = this.compileTemplate(data.url ?? '', input);
    const method = this.compileTemplate(data.method ?? '', input);
    const headers = Object.fromEntries(
      Object.entries(data.headers ?? {}).map(([key, value]) => [key, this.compileTemplate(value, input)]),
    );
    const body = this.compileTemplate(data.body ?? '', input);

    const response = await axios.request({
      url,
      method,
      headers,
      data: body,
    });

    return {
      payload: response.data,
    };
  }

  private async processMqttWaitForMessageNode(
    node: ResourceFlowNode,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const { serverId, topic, timeoutSeconds, subscribeQos } = node.data as z.infer<
      typeof MqttWaitForMessageNodeDataSchema
    >;

    // Ensure subscription exists (wildcards allowed)
    await this.mqttClientService.subscribe(serverId, topic, subscribeQos as unknown as 0 | 1 | 2).catch((error) => {
      this.logger.error(`Failed to subscribe for wait node to topic ${topic} on server ${serverId}`, error.stack);
      throw error;
    });

    this.logger.debug(
      `Waiting for MQTT message (serverId=${serverId}, topicFilter=${topic}, timeout=${timeoutSeconds}s)`,
    );

    const result = await new Promise<{ topic: string; payload: unknown }>((resolve, reject) => {
      const onMessage = (event: MqttMessageReceivedEvent) => {
        if (event.serverId !== serverId) {
          return;
        }
        if (!this.topicMatches(topic, event.topic)) {
          return;
        }
        cleanup();
        resolve({ topic: event.topic, payload: event.payload });
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error(`Timeout waiting for MQTT message on topic '${topic}' (server ${serverId})`));
      };

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this.eventEmitter.off(MqttMessageReceivedEvent.EVENT_NAME, onMessage as unknown as () => void);
      };

      const timeoutHandle = setTimeout(onTimeout, timeoutSeconds * 1000);
      this.eventEmitter.on(MqttMessageReceivedEvent.EVENT_NAME, onMessage as unknown as () => void);
    });

    return { payload: { topic: result.topic, payload: result.payload } };
  }

  private async processErrorNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const { message: messageTemplate } = node.data as z.infer<typeof ErrorNodeDataSchema>;

    const message = this.compileTemplate(messageTemplate, input);

    throw new FlowExecutionError(message);
  }

  private async processMqttSendMessageNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const { serverId, ...data } = node.data as z.infer<typeof MqttSendMessageNodeDataSchema>;

    const topic = this.compileTemplate(data.topic ?? '', input);
    const payload = this.compileTemplate(data.payload ?? '', input);

    this.logger.debug(
      `Publishing MQTT message to server ID: ${serverId} with topic: ${topic} and payload: "${payload}"`,
    );

    await this.mqttClientService.publish(serverId, topic, payload, {
      qos: data.qos as 0 | 1 | 2,
      retain: data.retain as boolean,
    });

    return {
      payload: input,
    };
  }

  private async processEndUsageSessionNode(
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const activeUsage = await this.resourceUsageService.getActiveSession(node.resourceId, false, transactionManager);

    if (!activeUsage) {
      throw new NoUsageSessionError();
    }

    if (!activeUsage.user) {
      throw new FlowExecutionError('Active session has no owner user; cannot end');
    }

    const { notes } = ResourceUsageEndSessionNodeDataSchema.parse(node.data ?? {});

    let finalNotes = '';
    if (typeof notes === 'string' && notes.length > 0) {
      const compiled = this.compileTemplate(notes, input);
      finalNotes = compiled && compiled.trim().length > 0 ? compiled : notes;
    }

    await this.resourceUsageService.endSession(node.resourceId, activeUsage.user, { notes: finalNotes }, true);

    return { payload: input };
  }

  public trackResourceActivity(resourceId: number) {
    this.resourceActivity.set(resourceId, new Date());
  }

  private heartbeatKey(resourceId: number, identifier: string): string {
    return `${resourceId}::${identifier}`;
  }

  public getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined {
    return this.heartbeatLastSeen.get(this.heartbeatKey(resourceId, identifier));
  }

  private async processHeartbeatNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const parsed = ResourceHealthHeartbeatNodeDataSchema.safeParse(node.data ?? {});
    if (!parsed.success) {
      this.logger.warn(`Heartbeat node ${node.id} has invalid data: ${parsed.error.message}`);
      return { payload: input };
    }
    const normalizedIdentifier = (parsed.data.identifier ?? '').trim();
    const now = new Date();

    this.heartbeatLastSeen.set(this.heartbeatKey(node.resourceId, normalizedIdentifier), now);

    await this.resourceHealthService.reportHealth({
      resourceId: node.resourceId,
      identifier: normalizedIdentifier,
      status: ResourceHealthStatus.HEALTHY,
      reason: null,
      source: ResourceHealthSource.HEARTBEAT,
      reportedAt: now,
    });

    return { payload: input };
  }

  private async processHealthSetNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const parsed = ResourceHealthSetNodeDataSchema.safeParse(node.data ?? {});
    if (!parsed.success) {
      throw new FlowExecutionError(`Invalid health-set node data: ${parsed.error.message}`);
    }

    const identifierFromPayload = get(input, 'health.identifier') as unknown;
    const identifierOverride =
      typeof identifierFromPayload === 'string' && identifierFromPayload.length > 0 ? identifierFromPayload : null;
    const identifier = identifierOverride ?? this.compileTemplate(parsed.data.identifier ?? '', input);

    const statusFromPayload = get(input, 'health.status') as unknown;
    const statusOverride =
      typeof statusFromPayload === 'string' && statusFromPayload.length > 0 ? statusFromPayload : null;
    const statusCandidate = statusOverride ?? parsed.data.status;
    const statusEnum = HealthStateOptionEnum.safeParse(statusCandidate);
    if (!statusEnum.success) {
      throw new FlowExecutionError(
        `Invalid health-set status "${String(statusCandidate)}"; expected "healthy" or "unhealthy"`,
      );
    }
    const status =
      statusEnum.data === 'healthy' ? ResourceHealthStatus.HEALTHY : ResourceHealthStatus.UNHEALTHY;

    const reasonFromPayload = get(input, 'health.reason') as unknown;
    const reasonOverride =
      typeof reasonFromPayload === 'string' && reasonFromPayload.length > 0 ? reasonFromPayload : null;
    const reasonCandidate = reasonOverride ?? this.compileTemplate(parsed.data.reason ?? '', input);

    await this.resourceHealthService.reportHealth({
      resourceId: node.resourceId,
      identifier,
      status,
      reason: status === ResourceHealthStatus.UNHEALTHY ? reasonCandidate : null,
      source: statusOverride !== null ? ResourceHealthSource.PAYLOAD : ResourceHealthSource.MANUAL,
    });

    return { payload: input };
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
      validKeys.add(this.heartbeatKey(node.resourceId, (parsed.data.identifier ?? '').trim()));
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
        const lastSeen = this.heartbeatLastSeen.get(this.heartbeatKey(node.resourceId, identifier));

        if (!lastSeen) {
          this.heartbeatLastSeen.set(this.heartbeatKey(node.resourceId, identifier), now);
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

  private async processActivityTrackActivityNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const { resourceId } = node;

    this.resourceActivity.set(resourceId, new Date());

    return { payload: input };
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
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(data);
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

  private async processBillingSetAdditionalItemsNode(
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const activeUsageSession = await this.resourceUsageService.getActiveSession(
      node.resourceId,
      false,
      transactionManager,
    );

    if (!activeUsageSession) {
      throw new NoUsageSessionError();
    }

    const data = BillingTransactionItemCreateSchema.parse(node.data);

    this.logger.debug(
      `Processing billing set additional items node with data: ${JSON.stringify({ data, input }, null, 2)}`,
    );

    let externalReference = data.externalReference;
    if ('externalReference' in input && typeof input.externalReference === 'string') {
      externalReference = input.externalReference;
      if (data.externalReference) {
        this.logger.debug(`Compiling external reference template: ${data.externalReference}`);
        externalReference = this.compileTemplate(
          BillingTransactionItemCreateSchema.shape.externalReference.parse(data.externalReference),
          input,
        );
      }
    }

    let quantity = data.quantity;
    if ('quantity' in input) {
      this.logger.debug(`Compiling quantity template: ${input.quantity}`);
      const numberQuantity = BillingTransactionItemCreateSchema.shape.quantity.parse(input.quantity);
      quantity = numberQuantity;
    }

    const manager = transactionManager ?? this.billingTransactionItemRepository.manager;

    const billingTransaction = await manager.findOne(BillingTransaction, {
      where: {
        resourceUsageId: activeUsageSession.id,
      },
    });

    const dedupData = {
      billingTransactionId: billingTransaction.id,
      name: data.name,
      description: data.description,
      externalReference,
      unitPrice: data.unitPrice,
    };

    const existingItem = await manager.findOne(BillingTransactionItem, {
      where: dedupData,
    });

    if (existingItem) {
      await manager.update(BillingTransactionItem, existingItem.id, {
        quantity: existingItem.quantity + quantity,
      });
    } else {
      await manager.save(BillingTransactionItem, {
        ...dedupData,
        quantity,
      });
    }

    return {
      payload: {
        name: data.name,
        description: data.description,
        externalReference,
        unitPrice: data.unitPrice,
        quantity,
      } as Omit<BillingTransactionItem, 'id' | 'billingTransactionId' | 'billingTransaction'>,
    };
  }
}
