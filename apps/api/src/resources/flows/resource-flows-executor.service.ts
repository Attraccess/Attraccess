import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, LessThan } from 'typeorm';
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

export type ResourceFlowLogEvent = { data: ResourceFlowLog | { keepalive: true } };

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
    private readonly configService: ConfigService
  ) {
    const flowConfig = this.configService.get<FlowConfigType>('flow');
    this.logTTLDays = flowConfig.FLOW_LOG_TTL_DAYS;
  }

  onModuleInit() {
    // Send keep-alive messages every 30 seconds to prevent connection timeouts
    this.keepAliveInterval = setInterval(() => {
      // For each resource subject, emit a keep-alive event
      this.resourceFlowLogSubjects.forEach((subject) => {
        subject.next({ data: { keepalive: true } });
      });
    }, 10000);
  }

  onModuleDestroy() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Complete all subjects when the module is destroyed
    this.resourceFlowLogSubjects.forEach((subject) => subject.complete());
  }

  /**
   * Creates a log entry for a flow node
   */
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

  @OnEvent(ResourceUsageStartedEvent.eventName)
  async handleResourceUsageStarted(event: ResourceUsageStartedEvent) {
    const { resourceId } = event;

    this.logger.log(`Handling resource usage started event for resource ID: ${resourceId}`);

    try {
      await this.handleEvent(resourceId, ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED);
      this.logger.log(`Successfully processed resource usage started event for resource ID: ${resourceId}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage started event for resource ID: ${resourceId}`, error.stack);
      throw error;
    }
  }

  @OnEvent(ResourceUsageTakenOverEvent.eventName)
  async handleResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    const { resourceId } = event;

    this.logger.log(`Handling resource usage takeover event for resource ID: ${resourceId}`);

    try {
      await this.handleEvent(resourceId, ResourceFlowNodeType.EVENT_RESOURCE_USAGE_TAKEOVER);
      this.logger.log(`Successfully processed resource usage takeover event for resource ID: ${resourceId}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage takeover event for resource ID: ${resourceId}`, error.stack);
      throw error;
    }
  }

  @OnEvent(ResourceUsageEndedEvent.eventName)
  async handleResourceUsageEnded(event: ResourceUsageEndedEvent) {
    const { resourceId } = event;

    this.logger.log(`Handling resource usage ended event for resource ID: ${resourceId}`);

    try {
      await this.handleEvent(resourceId, ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STOPPED);
      this.logger.log(`Successfully processed resource usage ended event for resource ID: ${resourceId}`);
    } catch (error) {
      this.logger.error(`Failed to handle resource usage ended event for resource ID: ${resourceId}`, error.stack);
      throw error;
    }
  }

  private async handleEvent(resourceId: number, eventType: ResourceFlowNodeType) {
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
    this.logger.debug(`Processing nodes: ${eventNodes.map((n) => `ID:${n.id} Type:${n.type}`).join(', ')}`);

    try {
      await Promise.all(
        eventNodes.map((node) => {
          const flowRunId = `${nanoid(3)}-${nanoid(3)}-${nanoid(3)}`;
          return this.processNode(flowRunId, node);
        })
      );
      this.logger.log(
        `Successfully processed all ${eventNodes.length} flow nodes for event type '${eventType}' and resource ID: ${resourceId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to process flow nodes for event type '${eventType}' and resource ID: ${resourceId}`,
        error.stack
      );
      throw error;
    }
  }

  private async processNode(flowRunId: string, node: ResourceFlowNode) {
    this.logger.debug(`Processing flow node - ID: ${node.id}, Type: ${node.type}, Resource ID: ${node.resourceId}`);

    const startTime = Date.now();

    try {
      // Log the start of node processing
      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
      });

      switch (node.type) {
        case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED:
        case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STOPPED:
        case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_TAKEOVER:
          await this.createFlowLog({
            flowRunId,
            nodeId: node.id,
            resourceId: node.resourceId,
            type: ResourceFlowLogType.FLOW_START,
          });
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

      // Log successful completion
      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_COMPLETED,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Failed to process flow node ID: ${node.id} (Type: ${node.type}) after ${processingTime}ms`,
        error.stack
      );

      // Log the error
      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.NODE_PROCESSING_FAILED,
        payload: JSON.stringify({ error }),
      });

      throw error;
    }

    await this.executeNextNode(flowRunId, node);
  }

  private async executeNextNode(flowRunId: string, node: ResourceFlowNode) {
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
      await this.createFlowLog({
        flowRunId,
        nodeId: node.id,
        resourceId: node.resourceId,
        type: ResourceFlowLogType.FLOW_COMPLETED,
      });
      return;
    }

    this.logger.debug(
      `Found ${edgesFromThisNode.length} outgoing edge(s) from node ID: ${node.id} (Type: ${node.type})`
    );

    const targetNodeIds = edgesFromThisNode.map((edge) => edge.target);
    this.logger.debug(`Target node IDs from node ${node.id} (Type: ${node.type}): ${targetNodeIds.join(', ')}`);

    const nextNodes = await this.flowNodeRepository.find({
      where: {
        id: In(targetNodeIds),
      },
    });

    if (nextNodes.length !== targetNodeIds.length) {
      this.logger.warn(
        `Expected ${targetNodeIds.length} target nodes from node ${node.id} (Type: ${node.type}), but found ${nextNodes.length}. Some target nodes may be missing.`
      );
    }

    this.logger.debug(`Executing ${nextNodes.length} next node(s) from node ID: ${node.id} (Type: ${node.type})`);

    await Promise.all(nextNodes.map((nextNode) => this.processNode(flowRunId, nextNode)));
    this.logger.debug(
      `Successfully executed all ${nextNodes.length} next node(s) from node ID: ${node.id} (Type: ${node.type})`
    );
  }
}
