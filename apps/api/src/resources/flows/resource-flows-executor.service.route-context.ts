import {
  BillingTransactionItem,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceUsage,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, EntityTarget, Repository } from 'typeorm';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceHealthService } from '../health/resource-health.service';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult, TemplateVariables } from './node-executors';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import {
  FlowExecutionOptions,
  FlowResourceContext,
  UsageEventData,
} from './resource-flows-executor.service.feature-definitions';

export abstract class ResourceFlowsExecutorServiceRouteContext {
  protected abstract readonly resourceHealthService: ResourceHealthService;
  protected abstract readonly heartbeatLastSeen: Map<string, Date>;
  protected abstract readonly resourceUsageService: ResourceUsageService;
  protected abstract readonly billingTransactionItemRepository: Repository<BillingTransactionItem>;
  protected abstract readonly mqttClientService: MqttClientService;
  protected abstract readonly resourceActivity: Map<Resource['id'], Date>;
  protected abstract readonly operatingIntervals: ResourceOperatingIntervalService;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract readonly variablesService: ResourceFlowVariablesService;
  protected abstract readonly companionGatewayService: CompanionGatewayService;
  protected abstract subscribeToMqttTopics(): Promise<void>;
  protected abstract readonly flowNodeRepository: Repository<ResourceFlowNode>;
  protected abstract readonly logger: Logger;
  protected abstract getRepository<T>(
    entity: EntityTarget<T>,
    defaultRepository: Repository<T>,
    transactionManager?: EntityManager,
  ): Repository<T>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract isPlainObject(value: unknown): value is Record<string, unknown>;
  protected abstract getResourceContext(
    resourceId: number,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<FlowResourceContext>;
  protected abstract readonly templateVariables: WeakMap<object, TemplateVariables>;
  protected abstract handleResourceUsage(usage: ResourceUsage, inputType: ResourceFlowNodeType): Promise<void>;
  public abstract startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
  protected abstract triggerResourceUsageNode(
    resourceId: number,
    eventType: ResourceFlowNodeType,
    eventData: UsageEventData,
  ): Promise<void>;
  protected abstract queuedPluginFlowLookup(lookup: () => Promise<ResourceFlowNode[]>): Promise<ResourceFlowNode[]>;
  protected abstract pluginFlowLookupQueue: Promise<void>;
  protected abstract readonly flowTimer: FlowTimer;
  protected abstract readonly flowLogs: FlowLogRecorderService;
  protected abstract settleFlowBranches(branches: Promise<NodeProcessingResult[]>[]): Promise<NodeProcessingResult[]>;
  protected abstract processNode(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
  protected abstract compileTemplate(template: string, data: object): string;
  protected abstract readonly nodeExecutors: Record<ResourceFlowNodeType, NodeExecutor>;
  protected abstract buildExecutionContext(
    flowRunId: string,
    transactionManager?: EntityManager,
    options?: FlowExecutionOptions,
  ): NodeExecutionContext;
  protected abstract withResourceContext(
    resourceId: number,
    payload: unknown,
    transactionManager?: EntityManager,
    cache?: Map<number, FlowResourceContext>,
  ): Promise<unknown>;
  protected abstract dispatchNode(
    flowRunId: string,
    node: ResourceFlowNode,
    input: object,
    transactionManager?: EntityManager,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult>;
  protected abstract errorReason(error: unknown): string;
  protected abstract executeNextNodes(
    flowRunId: string,
    node: ResourceFlowNode,
    resultOfPreviousNode: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
  protected abstract readonly flowEdgeRepository: Repository<ResourceFlowEdge>;
  protected abstract readonly cronTimer: CronTimer;
  protected abstract triggerCompanionEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: object,
    schema: { safeParse: (d: unknown) => { success: boolean; data?: { deviceId: number } } },
  ): Promise<void>;
  protected abstract triggerUsbDeviceEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: CompanionUsbDeviceDto,
  ): Promise<void>;
}
