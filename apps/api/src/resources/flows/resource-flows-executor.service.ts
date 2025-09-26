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
} from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageEvent } from '../usage/events/resource-usage.events';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { FlowConfigType } from './flow.config';
import { Subject } from 'rxjs';
import { nanoid } from 'nanoid';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import axios from 'axios';
import Handlebars from 'handlebars';
import { get } from 'lodash-es';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import z from 'zod';
import { NoUsageSessionError } from './errors/no-usage-session.error';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { MqttMessageReceivedNodeDataSchema } from 'libs/database-entities/src/lib/entities/resourceFlowNode';

export type ResourceFlowLogEvent = { data: ResourceFlowLog | { keepalive: true } };

interface NodeProcessingResult {
  payload: object;
  outputHandle?: string;
}

interface UsageEventData {
  resource: {
    id: number;
    name: string;
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

@Injectable()
export class ResourceFlowsExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceFlowsExecutorService.name);
  private readonly logTTLDays: number;
  private keepAliveInterval: NodeJS.Timeout;

  public readonly resourceFlowLogSubjects: Map<Resource['id'], Subject<ResourceFlowLogEvent>> = new Map();

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    private readonly flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(ResourceFlowLog)
    private readonly flowLogRepository: Repository<ResourceFlowLog>,
    private readonly configService: ConfigService,
    private readonly mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    private readonly resourceUsageService: ResourceUsageService,
    @InjectRepository(BillingTransactionItem)
    private readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
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
    const mqttMessageReceivedNodes = await this.flowNodeRepository.find({
      where: { type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED },
    });

    for (const node of mqttMessageReceivedNodes) {
      const { topic, serverId } = node.data as z.infer<typeof MqttMessageReceivedNodeDataSchema>;
      await this.mqttClientService.subscribe(serverId, topic).catch((error) => {
        this.logger.error(`Failed to subscribe to topic ${topic} for server ID ${serverId}`, error.stack);
      });
    }
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

  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupOldFlowLogs() {
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
    }
  }

  @OnEvent(MqttMessageReceivedEvent.EVENT_NAME)
  async handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent) {
    const { topic, payload } = event;

    const messageRecivedNodes = await this.flowNodeRepository.find({
      where: {
        type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
        data: {
          topic,
        },
      },
    });

    if (messageRecivedNodes.length === 0) {
      this.logger.debug(`No flow nodes found for topic: ${topic}`);
      return;
    }

    this.logger.log(`Found ${messageRecivedNodes.length} flow node(s) for topic: ${topic}`);

    await this.startFlow(messageRecivedNodes, { payload: { payload } });
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
  ): Promise<NodeProcessingResult[]> {
    const nodes = Array.isArray(node) ? node : [node];

    this.logger.debug(`Processing nodes: ${nodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

    const flowRunId = `${nanoid(3)}-${nanoid(3)}-${nanoid(3)}`;

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
          return this.processNode(flowRunId, node, data, transactionManager);
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
  }

  private async processNode(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult[]> {
    this.logger.debug(`Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}`);

    const startTime = Date.now();

    let responseOfNode: NodeProcessingResult = { payload: {} };

    try {
      // Log the start of node processing
      await this.createFlowLog(
        {
          flowRunId,
          nodeId: node.id,
          resourceId: node.resourceId,
          type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
          payload: JSON.stringify({ input: resultOfPreviousNode.payload }),
        },
        transactionManager,
      );

      switch (node.type) {
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
        case ResourceFlowNodeType.INPUT_BUTTON:
        case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
          responseOfNode = {
            payload: resultOfPreviousNode.payload,
          };
          break;

        case ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
          responseOfNode = await this.processBillingSetAdditionalItemsNode(
            node,
            resultOfPreviousNode.payload,
            transactionManager,
          );
          break;

        case ResourceFlowNodeType.PROCESSING_WAIT:
          responseOfNode = await this.processWaitNode(node, resultOfPreviousNode.payload, transactionManager);
          break;

        case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
          responseOfNode = await this.processHttpSendRequestNode(
            node,
            resultOfPreviousNode.payload,
            transactionManager,
          );
          break;

        case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
          responseOfNode = await this.processMqttSendMessageNode(
            node,
            resultOfPreviousNode.payload,
            transactionManager,
          );
          break;

        case ResourceFlowNodeType.PROCESSING_IF:
          responseOfNode = await this.processIfNode(node, resultOfPreviousNode.payload, transactionManager);
          break;

        default: {
          const exhaustiveCheck: never = node.type;
          throw new Error(`Unknown node type: ${exhaustiveCheck}`);
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.debug(`Successfully processed flow node ID: ${node.id} (Type: ${node.type}) in ${processingTime}ms`);

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

      return await this.executeNextNodes(flowRunId, node, responseOfNode, transactionManager);
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
  }

  private async executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
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

      return this.processNode(flowRunId, targetNode, resultOfPreviousNode, transactionManager);
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
        throw new Error(`Unknown comparison operator: ${exhaustiveCheck}`);
      }
    }

    return {
      payload: input,
      outputHandle: result ? 'output-true' : 'output-false',
    };
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

  private async processMqttSendMessageNode(
    node: ResourceFlowNode,
    input: object,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const { serverId, ...data } = node.data as z.infer<typeof MqttSendMessageNodeDataSchema>;

    const topic = this.compileTemplate(data.topic ?? '', input);
    const payload = this.compileTemplate(data.payload ?? '', input);

    await this.mqttClientService.publish(serverId, topic, payload);

    return {
      payload: input,
    };
  }

  private compileTemplate(template: string, data: object): string {
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate({ input: data });
  }

  public async pressButton(resourceId: number, buttonId: string, executingUserId: number) {
    const activeResourceUsage = await this.resourceUsageService.getActiveSession(resourceId);

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
      throw new NotFoundException('Button not found');
    }

    await this.startFlow(button, { payload: {} });
  }

  private async processBillingSetAdditionalItemsNode(
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
  ): Promise<NodeProcessingResult> {
    const activeUsageSession = await this.resourceUsageService.getActiveSession(node.resourceId, transactionManager);

    if (!activeUsageSession) {
      throw new NoUsageSessionError();
    }

    const data = node.data as z.infer<typeof BillingTransactionItemCreateSchema>;

    let externalReference = data.externalReference;
    if ('externalReference' in input && typeof input.externalReference === 'string') {
      externalReference = input.externalReference;
      if (data.externalReference) {
        externalReference = this.compileTemplate(data.externalReference, input);
      }
    }

    let quantity = data.quantity;
    if ('quantity' in input && typeof input.quantity === 'number') {
      quantity = input.quantity;
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
