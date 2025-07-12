import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  ResourceFlowLog,
  ResourceFlowLogType,
  Resource,
} from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ResourceUsageEndedEvent,
  ResourceUsageStartedEvent,
  ResourceUsageTakenOverEvent,
} from '../usage/events/resource-usage.events';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { FlowConfigType } from './flow.config';
import { Subject } from 'rxjs';
import { nanoid } from 'nanoid';
import {
  ResourceFlowActionHttpSendRequestNodeData,
  ResourceFlowActionMqttSendMessageNodeData,
  ResourceFlowActionUtilWaitNodeData,
} from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import axios from 'axios';
import Handlebars from 'handlebars';

export type ResourceFlowLogEvent = { data: ResourceFlowLog | { keepalive: true } };

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
    private readonly mqttClientService: MqttClientService
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

  @OnEvent(ResourceUsageStartedEvent.EVENT_NAME)
  async handleResourceUsageStarted(event: ResourceUsageStartedEvent) {
    const { resource } = event;

    this.logger.log(`Handling resource usage started event for resource ID: ${resource.id}`);

    try {
      await this.handleResourceUsageEvent(resource.id, ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED, {
        event: {
          timestamp: event.startTime.toISOString(),
        },
        usage: {
          start: event.startTime.toISOString(),
          end: null,
        },
        user: {
          id: event.user.id,
          username: event.user.username,
          externalIdentifier: event.user.externalIdentifier,
        },
        resource: {
          id: event.resource.id,
          name: event.resource.name,
        },
      });
      this.logger.log(`Successfully processed resource usage started event for resource ID: ${resource.id}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage started event for resource ID: ${resource.id}`, error.stack);
      throw error;
    }
  }

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  async handleResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    const { resource } = event;

    this.logger.log(`Handling resource usage takeover event for resource ID: ${resource.id}`);

    try {
      await this.handleResourceUsageEvent(resource.id, ResourceFlowNodeType.EVENT_RESOURCE_USAGE_TAKEOVER, {
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

  @OnEvent(ResourceUsageEndedEvent.EVENT_NAME)
  async handleResourceUsageEnded(event: ResourceUsageEndedEvent) {
    const { resource } = event;

    this.logger.log(`Handling resource usage ended event for resource ID: ${resource.id}`);

    try {
      await this.handleResourceUsageEvent(resource.id, ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STOPPED, {
        event: {
          timestamp: event.endTime.toISOString(),
        },
        usage: {
          start: event.startTime.toISOString(),
          end: event.endTime.toISOString(),
        },
        user: {
          id: event.user.id,
          username: event.user.username,
          externalIdentifier: event.user.externalIdentifier,
        },
        resource: {
          id: event.resource.id,
          name: event.resource.name,
        },
      });
      this.logger.log(`Successfully processed resource usage ended event for resource ID: ${resource.id}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage ended event for resource ID: ${resource.id}`, error.stack);
      throw error;
    }
  }

  private async handleResourceUsageEvent(
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

    await this.startFlow(eventNodes, eventData);
  }

  private async startFlow(node: ResourceFlowNode | ResourceFlowNode[], data: object) {
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

  private async processNode(flowRunId: string, node: ResourceFlowNode, resultOfPreviousNode: object) {
    this.logger.debug(`Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}`);

    const startTime = Date.now();

    let responseOfNode: object = {};

    try {
      // Log the start of node processing
      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
        payload: JSON.stringify({ input: resultOfPreviousNode }),
      });

      switch (node.type) {
        case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_TAKEOVER:
          responseOfNode = resultOfPreviousNode;
          break;

        case ResourceFlowNodeType.ACTION_WAIT:
          responseOfNode = await this.processWaitNode(node, resultOfPreviousNode);
          break;

        case ResourceFlowNodeType.ACTION_HTTP_SEND_REQUEST:
          responseOfNode = await this.processHttpSendRequestNode(node, resultOfPreviousNode);
          break;

        case ResourceFlowNodeType.ACTION_MQTT_SEND_MESSAGE:
          responseOfNode = await this.processMqttSendMessageNode(node, resultOfPreviousNode);
          break;

        default: {
          await this.createFlowLog({
            flowRunId,
            nodeId: node.id,
            resourceId: node.resourceId,
            type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
            payload: JSON.stringify({ error: `Unknown node type: ${node.type} for node ID: ${node.id}` }),
          });
          throw new Error(`Unknown node type: ${node.type} for node ID: ${node.id}`);
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.debug(`Successfully processed flow node ID: ${node.id} (Type: ${node.type}) in ${processingTime}ms`);

      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_COMPLETED,
        payload: JSON.stringify({ output: responseOfNode }),
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

  private async executeNextNodes(flowRunId: string, node: ResourceFlowNode, resultOfPreviousNode: object) {
    this.logger.debug(`Looking for outgoing edges from node ID: ${node.id} (Type: ${node.type})`);

    const edgesFromThisNode = await this.flowEdgeRepository.find({
      where: {
        source: node.id,
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

  private async processWaitNode(node: ResourceFlowNode, input: object) {
    const { duration, unit } = node.data as ResourceFlowActionUtilWaitNodeData;

    let waitDurationMs = duration * 1000;
    if (unit === 'minutes') {
      waitDurationMs *= 60;
    } else if (unit === 'hours') {
      waitDurationMs *= 60 * 60;
    }

    await new Promise((resolve) => setTimeout(resolve, waitDurationMs));

    return input;
  }

  private async processHttpSendRequestNode(node: ResourceFlowNode, input: object) {
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

    return response.data;
  }

  private async processMqttSendMessageNode(node: ResourceFlowNode, input: object) {
    const { serverId, ...data } = node.data as ResourceFlowActionMqttSendMessageNodeData;

    const topic = this.compileTemplate(data.topic ?? '', input);
    const payload = this.compileTemplate(data.payload ?? '', input);

    await this.mqttClientService.publish(serverId, topic, payload);

    return input;
  }

  private compileTemplate(template: string, data: object): string {
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate({ input: data });
  }
}
