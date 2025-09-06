import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  ResourceFlowLog,
  ResourceFlowLogType,
  Resource,
  ResourceUsageAction,
  ResourceUsage,
} from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageEvent, ResourceUsageTakenOverEvent } from '../usage/events/resource-usage.events';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { FlowConfigType } from './flow.config';
import { Subject } from 'rxjs';
import { nanoid } from 'nanoid';
import {
  ResourceFlowActionHttpSendRequestNodeData,
  ResourceFlowActionMqttSendMessageNodeData,
  ResourceFlowActionUtilWaitNodeData,
  ResourceFlowActionIfNodeData,
} from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import axios from 'axios';
import Handlebars from 'handlebars';
import { get } from 'lodash-es';
import { ResourceUsageService } from '../usage/resourceUsage.service';

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
    private readonly resourceUsageService: ResourceUsageService
  ) {
    const flowConfig = this.configService.get<FlowConfigType>('flow');
    this.logTTLDays = flowConfig.FLOW_LOG_TTL_DAYS;
  }

  onModuleInit() {
    // Send keep-alive messages every 30 seconds to prevent connection timeouts
    this.keepAliveInterval = setInterval(() => {
      this.resourceFlowLogSubjects.forEach((subject) => {
        subject.next({ data: { keepalive: true } });
      });
    }, 10000);
  }

  onModuleDestroy() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    this.resourceFlowLogSubjects.forEach((subject) => subject.complete());
  }

  private async createFlowLog(data: Omit<ResourceFlowLog, 'id' | 'createdAt' | 'resource'>): Promise<ResourceFlowLog> {
    const logEntry = this.flowLogRepository.create(data);

    try {
      const log = await this.flowLogRepository.save(logEntry);
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

  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupOldFlowLogs() {
    const cutoffDate = new Date(Date.now() - this.logTTLDays * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Starting cleanup of flow logs older than ${this.logTTLDays} days (before ${cutoffDate.toISOString()})`
    );

    try {
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
    const { usage } = event;

    switch (usage.usageAction) {
      case ResourceUsageAction.Usage:
        if (usage.endTime) {
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED);
        } else {
          await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED);
        }
        break;
      case ResourceUsageAction.DoorLock:
        await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED);
        break;
      case ResourceUsageAction.DoorUnlock:
        await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED);
        break;
      case ResourceUsageAction.DoorUnlatch:
        await this.handleResourceUsage(usage, ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED);
        break;
    }
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

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  async handleResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    const { resource } = event;

    this.logger.log(`Handling resource usage takeover event for resource ID: ${resource.id}`);

    try {
      await this.triggerResourceUsageNode(resource.id, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER, {
        event: {
          timestamp: event.takeoverTime.toISOString(),
        },
        usage: {
          start: event.takeoverTime.toISOString(),
          end: null,
        },
        user: {
          id: event.newUser.id,
          username: event.newUser.username,
          externalIdentifier: event.newUser.externalIdentifier,
        },
        previousUser: {
          id: event.previousUser.id,
          username: event.previousUser.username,
          externalIdentifier: event.previousUser.externalIdentifier,
        },
        resource: {
          id: event.resource.id,
          name: event.resource.name,
        },
      });
      this.logger.log(`Successfully processed resource usage takeover event for resource ID: ${resource.id}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage takeover event for resource ID: ${resource.id}`, error.stack);
      throw error;
    }
  }

  private async triggerResourceUsageNode(
    resourceId: number,
    eventType: ResourceFlowNodeType,
    eventData: UsageEventData
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
      `Found ${eventNodes.length} flow node(s) for event type '${eventType}' and resource ID: ${resourceId}`
    );

    await this.startFlow(eventNodes, { payload: eventData });
  }

  private async startFlow(node: ResourceFlowNode | ResourceFlowNode[], data: NodeProcessingResult) {
    const nodes = Array.isArray(node) ? node : [node];

    this.logger.debug(`Processing nodes: ${nodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

    const flowRunId = `${nanoid(3)}-${nanoid(3)}-${nanoid(3)}`;

    await this.createFlowLog({
      flowRunId,
      nodeId: null,
      resourceId: nodes[0].resourceId,
      type: ResourceFlowLogType.FLOW_START,
    });

    try {
      await Promise.all(
        nodes.map((node) => {
          return this.processNode(flowRunId, node, data);
        })
      );
      this.logger.log(`Successfully processed all ${nodes.length} flow nodes`);
    } catch (error) {
      this.logger.error(`Failed to process flow nodes`, error.stack);
      throw error;
    } finally {
      await this.createFlowLog({
        flowRunId,
        nodeId: null,
        resourceId: nodes[0].resourceId,
        type: ResourceFlowLogType.FLOW_COMPLETED,
      });
    }
  }

  private async processNode(flowRunId: string, node: ResourceFlowNode, resultOfPreviousNode: NodeProcessingResult) {
    this.logger.debug(`Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}`);

    const startTime = Date.now();

    let responseOfNode: NodeProcessingResult = { payload: {} };

    try {
      // Log the start of node processing
      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
        payload: JSON.stringify({ input: resultOfPreviousNode.payload }),
      });

      switch (node.type) {
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
        case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
        case ResourceFlowNodeType.INPUT_BUTTON:
          responseOfNode = {
            payload: resultOfPreviousNode.payload,
          };
          break;

        case ResourceFlowNodeType.PROCESSING_WAIT:
          responseOfNode = await this.processWaitNode(node, resultOfPreviousNode.payload);
          break;

        case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
          responseOfNode = await this.processHttpSendRequestNode(node, resultOfPreviousNode.payload);
          break;

        case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
          responseOfNode = await this.processMqttSendMessageNode(node, resultOfPreviousNode.payload);
          break;

        case ResourceFlowNodeType.PROCESSING_IF:
          responseOfNode = await this.processIfNode(node, resultOfPreviousNode.payload);
          break;

        default: {
          const message = `Unknown node type: ${node.type} for node ID: ${node.id}`;
          await this.createFlowLog({
            flowRunId,
            nodeId: node.id,
            resourceId: node.resourceId,
            type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
            payload: JSON.stringify({ error: message }),
          });
          throw new Error(message);
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.debug(`Successfully processed flow node ID: ${node.id} (Type: ${node.type}) in ${processingTime}ms`);

      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_COMPLETED,
        payload: JSON.stringify({ output: responseOfNode.payload }),
      });

      await this.executeNextNodes(flowRunId, node, responseOfNode);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Failed to process flow node ID: ${node.id} (Type: ${node.type}) after ${processingTime}ms`,
        error.stack
      );

      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
        payload: JSON.stringify({ error }),
      });
    }
  }

  private async executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult
  ) {
    this.logger.debug(`Looking for outgoing edges from node ID: ${node.id} (Type: ${node.type})`);

    const edgesFromThisNode = await this.flowEdgeRepository.find({
      where: {
        source: node.id,
        sourceHandle: resultOfPreviousNode.outputHandle,
      },
    });

    if (edgesFromThisNode.length === 0) {
      this.logger.debug(
        `No outgoing edges found from node ID: ${node.id} (Type: ${node.type}) - flow execution stops here`
      );
      return;
    }

    this.logger.debug(
      `Found ${edgesFromThisNode.length} outgoing edge(s) from node ID: ${node.id} (Type: ${node.type})`
    );

    // Execute each edge individually instead of deduplicating target nodes
    const edgePromises = edgesFromThisNode.map(async (edge) => {
      const targetNode = await this.flowNodeRepository.findOne({
        where: { id: edge.target },
      });

      if (!targetNode) {
        this.logger.warn(`Target node ${edge.target} not found for edge from node ${node.id}`);
        return;
      }

      return this.processNode(flowRunId, targetNode, resultOfPreviousNode);
    });

    await Promise.all(edgePromises);
  }

  private async processWaitNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const { duration, unit } = node.data as ResourceFlowActionUtilWaitNodeData;

    let waitDurationMs = duration * 1000;
    if (unit === 'minutes') {
      waitDurationMs *= 60;
    } else if (unit === 'hours') {
      waitDurationMs *= 60 * 60;
    }

    await new Promise((resolve) => setTimeout(resolve, waitDurationMs));

    return { payload: input };
  }

  private async processIfNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const {
      path,
      comparisonOperator,
      comparisonValue: comparisonValueTemplate,
      comparisonValueIsPath,
    } = node.data as ResourceFlowActionIfNodeData;

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
      default:
        throw new Error(`Unknown comparison operator: ${comparisonOperator}`);
    }

    return {
      payload: input,
      outputHandle: result ? 'output-true' : 'output-false',
    };
  }

  private async processHttpSendRequestNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const data = node.data as ResourceFlowActionHttpSendRequestNodeData;

    const url = this.compileTemplate(data.url ?? '', input);
    const method = this.compileTemplate(data.method ?? '', input);
    const headers = Object.fromEntries(
      Object.entries(data.headers).map(([key, value]) => [key, this.compileTemplate(value, input)])
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

  private async processMqttSendMessageNode(node: ResourceFlowNode, input: object): Promise<NodeProcessingResult> {
    const { serverId, ...data } = node.data as ResourceFlowActionMqttSendMessageNodeData;

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
}
