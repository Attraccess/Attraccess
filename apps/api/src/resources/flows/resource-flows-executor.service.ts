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
import { EntityManager, Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceFlowNodeType,
  Resource,
  ResourceUsageAction,
  ResourceUsage,
  BillingTransactionItem,
  CompanionIdleActiveNodeDataSchema,
  CompanionForegroundAppNodeDataSchema,
} from '@attraccess/database-entities';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';
import { FlowLogRecorderService } from './flow-log-recorder.service';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { ResourceHealthService } from '../health/resource-health.service';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { FlowTimer } from '../../metrics/instrumentation/flow/flow.helper';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { CompanionGatewayService } from '../../companion/companion-gateway.service';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { ResourceMeteringService } from '../metering/resource-metering.service';
import { NodeProcessingResult, heartbeatKey } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext, UsageEventData } from './flow-execution.types';
import { FlowExecutionContext, getFlowRepository } from './flow-execution-context';
import { FlowExecutionEngine } from './flow-execution-engine';
import { FlowTriggerDispatcher } from './flow-trigger-dispatcher';
import { FlowResourceMonitor } from './flow-resource-monitor';
import { buildNodeExecutorRegistry } from './node-executor-registry';

@Injectable()
export class ResourceFlowsExecutorService implements OnModuleInit {
  private readonly logger = new Logger(ResourceFlowsExecutorService.name);
  private readonly resourceActivity = new Map<Resource['id'], Date>();
  private readonly heartbeatLastSeen = new Map<string, Date>();
  private readonly engine: FlowExecutionEngine;
  private readonly triggers: FlowTriggerDispatcher;
  private readonly monitor: FlowResourceMonitor;

  constructor(
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge)
    flowEdgeRepository: Repository<ResourceFlowEdge>,
    @InjectRepository(Resource)
    resourceRepository: Repository<Resource>,
    flowLogs: FlowLogRecorderService,
    mqttClientService: MqttClientService,
    @Inject(forwardRef(() => ResourceUsageService))
    private readonly resourceUsageService: ResourceUsageService,
    @InjectRepository(BillingTransactionItem)
    billingTransactionItemRepository: Repository<BillingTransactionItem>,
    eventEmitter: EventEmitter2,
    resourceHealthService: ResourceHealthService,
    variablesService: ResourceFlowVariablesService,
    cronTimer: CronTimer,
    flowTimer: FlowTimer,
    companionGatewayService: CompanionGatewayService,
    operatingIntervals: ResourceOperatingIntervalService,
    @Inject(forwardRef(() => ResourceMeteringService)) metering: ResourceMeteringService,
  ) {
    const nodeExecutors = buildNodeExecutorRegistry({
      resourceActivity: this.resourceActivity,
      heartbeatLastSeen: this.heartbeatLastSeen,
      resourceHealthService,
      resourceUsageService,
      billingTransactionItemRepository,
      mqttClientService,
      operatingIntervals,
      eventEmitter,
      variablesService,
      companionGatewayService,
      metering,
    });
    this.engine = new FlowExecutionEngine(
      flowNodeRepository,
      flowEdgeRepository,
      flowLogs,
      flowTimer,
      nodeExecutors,
      new FlowExecutionContext(resourceRepository, variablesService),
      this.logger,
    );
    this.triggers = new FlowTriggerDispatcher(
      flowNodeRepository,
      mqttClientService,
      (nodes, data) => this.startFlow(nodes, data),
      this.logger,
    );
    this.monitor = new FlowResourceMonitor(
      flowNodeRepository,
      this.resourceActivity,
      this.heartbeatLastSeen,
      resourceHealthService,
      cronTimer,
      (node, data) => this.startFlow(node, data),
      this.logger,
    );
  }

  async onModuleInit() {
    await this.triggers.subscribeToMqttTopics();
  }

  @OnEvent(MqttMessageReceivedEvent.EVENT_NAME)
  async handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent) {
    return this.triggers.handleMqttMessageReceivedEvent(event);
  }

  public async triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void> {
    return this.triggers.triggerPluginFlows(pluginName, nodeType, matches, payload);
  }

  public async startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    return this.engine.startFlow(node, data, transactionManager, resourceContextCache, options);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkHealthHeartbeats() {
    return this.monitor.checkHealthHeartbeats();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkResourceActivity() {
    return this.monitor.checkResourceActivity();
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
    options: FlowExecutionOptions = {},
  ): Promise<object[]> {
    const repository = getFlowRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

    const allNodes = await repository.find({
      where: {
        resourceId,
        type: triggerNodeType,
      },
    });

    const nodes = options.metering
      ? allNodes.filter((node) => node.data?.meterId === options.metering?.meterId)
      : allNodes;
    if (nodes.length === 0) {
      this.logger.debug(
        `No flow nodes found for trigger node type '${triggerNodeType}' and resource ID: ${resourceId}`,
      );
      return [];
    }

    // TODO: propagate errors so when calling runFlow you can react to them and they dont get ignored
    const results = await this.startFlow(nodes, { payload: initialData }, transactionManager, new Map(), options);
    return results.map((r) => r.payload);
  }

  public trackResourceActivity(resourceId: number) {
    this.resourceActivity.set(resourceId, new Date());
  }

  public getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined {
    return this.heartbeatLastSeen.get(heartbeatKey(resourceId, identifier));
  }

  @OnEvent('companion.idle')
  async handleCompanionIdle(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_IDLE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  @OnEvent('companion.active')
  async handleCompanionActive(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_ACTIVE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  @OnEvent('companion.foreground_app')
  async handleCompanionForegroundApp(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED,
      event.payload,
      CompanionForegroundAppNodeDataSchema,
    );
  }

  @OnEvent('companion.usb_connected')
  async handleCompanionUsbConnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggers.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED,
      event.payload,
    );
  }

  @OnEvent('companion.usb_disconnected')
  async handleCompanionUsbDisconnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggers.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED,
      event.payload,
    );
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
      throw new NotFoundException('UNKNOWN_BUTTON_ID', { cause: { buttonId } });
    }

    await this.startFlow(button, { payload: {} });
  }
}
