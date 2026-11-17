import { Inject, Injectable, OnModuleInit, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';

import {
  FlowNodeRecord,
  UsageSession,
  CompanionForegroundAppNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  ResourceFlowNodeType,
  ResourceUsageAction,
} from '@attraccess/application-models';

import type { TransactionContext } from '../../../database/transaction-context';
import { UNIT_OF_WORK, UnitOfWork } from '../../../database/unit-of-work';
import { FLOW_BILLING_ITEM_STORE, FlowBillingItemStore } from '../flow-billing-item-store.port';
import { FLOW_TRIGGER_STORE, FlowTriggerStore } from '../flow-trigger-store.port';

import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { ResourceFlowVariablesService } from '../variables/resource-flow-variables.service';

import { FlowLogRecorderService } from '../logs/flow-log-recorder.service';

import { MqttClientService } from '../../../mqtt/mqtt-client.service';

import type { ResourceUsageService } from '../../usage/sessions/resource-usage.service';

import { ResourceHealthService } from '../../health/resource-health.service';

import { CronTimer } from '../../../metrics/instrumentation/cron/cron.helper';

import { FlowTimer } from '../../../metrics/instrumentation/flow/flow.helper';

import { ResourceOperatingIntervalService } from '../../operating-intervals/resource-operating-interval.service';

import { CompanionGatewayService } from '../../../companion/companion-gateway.service';

import type { ResourceMeteringService } from '../../metering/resource-metering.service';

import { CompanionUsbDeviceDto } from '../../../companion/companion.types';

import { heartbeatKey, NodeExecutor, NodeProcessingResult } from '../node-executors';

import type { FlowExecutionOptions, UsageEventData, FlowResourceContext } from './flow-execution.types';

import { FlowExecutionContext } from './flow-execution-context';

import { ResourceSessionStartedEvent } from '../../usage/events/resource-usage.events';

import { Cron, CronExpression } from '@nestjs/schedule';

import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../../mqtt/mqtt-message.event';

import { FlowExecutionEngine } from './flow-execution-engine';

import { FlowTriggerDispatcher } from './trigger-dispatcher';

import { FlowResourceMonitor } from './resource-monitor';

import { buildNodeExecutorRegistry, meteringNodeExecutors, usageNodeExecutors } from './node-executor-registry';

import { isGlobalFlowNode, triggerAppliesToResourceType } from './flow-node-queries';

@Injectable()
export class ResourceFlowsExecutorService implements OnModuleInit {
  public constructor(
    @Inject(FLOW_TRIGGER_STORE)
    protected readonly flowStore: FlowTriggerStore,
    flowLogs: FlowLogRecorderService,
    mqttClientService: MqttClientService,
    @Inject(FLOW_BILLING_ITEM_STORE)
    protected readonly billingItems: FlowBillingItemStore,
    @Inject(UNIT_OF_WORK)
    protected readonly unitOfWork: UnitOfWork,
    eventEmitter: EventEmitter2,
    resourceHealthService: ResourceHealthService,
    variablesService: ResourceFlowVariablesService,
    cronTimer: CronTimer,
    flowTimer: FlowTimer,
    companionGatewayService: CompanionGatewayService,
    operatingIntervals: ResourceOperatingIntervalService,
  ) {
    this.nodeExecutors = buildNodeExecutorRegistry({
      resourceActivity: this.resourceActivity,
      heartbeatLastSeen: this.heartbeatLastSeen,
      resourceHealthService,
      mqttClientService,
      operatingIntervals,
      eventEmitter,
      variablesService,
      companionGatewayService,
    });
    this.engine = new FlowExecutionEngine(
      flowStore,
      flowLogs,
      flowTimer,
      this.nodeExecutors,
      new FlowExecutionContext(flowStore, variablesService),
      this.logger,
    );
    this.triggers = new FlowTriggerDispatcher(
      flowStore,
      mqttClientService,
      (nodes, data) => this.startFlow(nodes, data),
      this.logger,
    );
    this.monitor = new FlowResourceMonitor(
      flowStore,
      this.resourceActivity,
      this.heartbeatLastSeen,
      resourceHealthService,
      cronTimer,
      (node, data, options) => this.startFlow(node, data, undefined, new Map(), options),
      this.logger,
    );
  }

  protected readonly logger = new Logger('ResourceFlowsExecutorService');

  protected readonly resourceActivity = new Map<number, Date>();

  protected readonly heartbeatLastSeen = new Map<string, Date>();

  protected readonly engine: FlowExecutionEngine;

  /** Shared with the engine by reference, so executors attached later reach it. Never copy it. */
  protected readonly nodeExecutors: Partial<Record<ResourceFlowNodeType, NodeExecutor>>;

  protected resourceUsageService?: ResourceUsageService;

  /**
   * Usage and metering depend on flows (they start flow runs) while some flow nodes call back into them, so
   * `ResourceUsageFlowsBridge` and `ResourceMeteringFlowsBridge` attach them here at startup instead of flows
   * injecting them, which would make the modules import each other.
   */
  public attachUsage(resourceUsageService: ResourceUsageService): void {
    this.resourceUsageService = resourceUsageService;
    Object.assign(this.nodeExecutors, usageNodeExecutors(resourceUsageService, this.billingItems, this.unitOfWork));
  }

  public attachMetering(metering: ResourceMeteringService): void {
    Object.assign(this.nodeExecutors, meteringNodeExecutors(metering));
  }

  protected get usage(): ResourceUsageService {
    if (!this.resourceUsageService) throw new Error('Resource usage is not attached to flows');
    return this.resourceUsageService;
  }

  protected readonly triggers: FlowTriggerDispatcher;

  protected readonly monitor: FlowResourceMonitor;

  public async pressButton(resourceId: number, buttonId: string, executingUserId: number) {
    // With parallel sessions any active session owner may press the machine's buttons.
    const activeSessions = await this.usage.getActiveSessionsForResource(resourceId);
    const pressingSession = activeSessions.find((session) => session.userId === executingUserId);

    if (!executingUserId || !pressingSession) {
      throw new ForbiddenException('You are not allowed to press this button');
    }

    const button = await this.flowStore.findButton(resourceId, buttonId.toString());

    if (!button) {
      throw new NotFoundException('UNKNOWN_BUTTON_ID', { cause: { buttonId } });
    }

    // The pressing owner's session is the triggering session for end-session and billing nodes.
    await this.startFlow(button, { payload: { usageId: pressingSession.id } }, undefined, new Map(), {
      actorUserId: executingUserId,
    });
  }

  @OnEvent('companion.usb_disconnected')
  async handleCompanionUsbDisconnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggers.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED,
      event.payload,
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

  @OnEvent('companion.foreground_app')
  async handleCompanionForegroundApp(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED,
      event.payload,
      CompanionForegroundAppNodeDataSchema,
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

  @OnEvent('companion.idle')
  async handleCompanionIdle(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggers.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_IDLE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  public getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined {
    return this.heartbeatLastSeen.get(heartbeatKey(resourceId, identifier));
  }

  public trackResourceActivity(resourceId: number) {
    this.resourceActivity.set(resourceId, new Date());
  }

  /**
   * Runs the trigger nodes of the resource's own flow together with the matching nodes of enabled global flows,
   * with the same transaction and options. A failing global flow therefore fails the run like the resource's own.
   */
  public async runFlow(
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    initialData: object = {},
    transactionManager?: TransactionContext,
    options: FlowExecutionOptions = {},
  ): Promise<object[]> {
    const allNodes = await this.flowStore.findTriggerNodesForResource(resourceId, triggerNodeType, transactionManager);

    // Metering runs belong to one meter of one resource; global flows never take part.
    let nodes = options.metering
      ? allNodes.filter((node) => !isGlobalFlowNode(node) && node.data?.meterId === options.metering?.meterId)
      : allNodes;

    if (nodes.some(isGlobalFlowNode)) {
      const resource = await this.flowStore.findResource(resourceId, transactionManager);
      nodes = nodes.filter(
        (node) => !isGlobalFlowNode(node) || triggerAppliesToResourceType(node.type, resource?.type),
      );
    }

    if (nodes.length === 0) {
      this.logger.debug(
        `No flow nodes found for trigger node type '${triggerNodeType}' and resource ID: ${resourceId}`,
      );
      return [];
    }

    // TODO: propagate errors so when calling runFlow you can react to them and they dont get ignored
    const results = await this.startFlow(nodes, { payload: initialData }, transactionManager, new Map(), {
      ...options,
      triggeringResourceId: resourceId,
    });
    return results.map((r) => r.payload);
  }

  protected async triggerResourceUsageNode(
    resourceId: number,
    eventType: ResourceFlowNodeType,
    eventData: UsageEventData,
  ) {
    this.logger.debug(`Looking for flow nodes of type '${eventType}' for resource ID: ${resourceId}`);
    await this.runFlow(resourceId, eventType, eventData);
  }

  protected async handleResourceUsage(usage: UsageSession, inputType: ResourceFlowNodeType) {
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

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkResourceActivity() {
    return this.monitor.checkResourceActivity();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async checkHealthHeartbeats() {
    return this.monitor.checkHealthHeartbeats();
  }

  public async startFlow(
    node: FlowNodeRecord | FlowNodeRecord[],
    data: NodeProcessingResult,
    transactionManager?: TransactionContext,
    resourceContextCache: Map<number, FlowResourceContext> = new Map(),
    options: FlowExecutionOptions = {},
  ): Promise<NodeProcessingResult[]> {
    return this.engine.startFlow(node, data, transactionManager, resourceContextCache, options);
  }

  public async triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void> {
    return this.triggers.triggerPluginFlows(pluginName, nodeType, matches, payload);
  }

  @OnEvent(MqttMessageReceivedEvent.EVENT_NAME)
  async handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent) {
    return this.triggers.handleMqttMessageReceivedEvent(event);
  }

  async onModuleInit() {
    await this.triggers.subscribeToMqttTopics();
  }
}
