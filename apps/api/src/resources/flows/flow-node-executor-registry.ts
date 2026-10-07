import {
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { EntityManager, EntityTarget, Repository } from 'typeorm';
import z from 'zod';
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
  MeteringReadyExecutor,
  MeteringReportExecutor,
  MqttSendMessageExecutor,
  MqttWaitForMessageExecutor,
  NodeExecutor,
  OperatingTransitionExecutor,
  PassthroughExecutor,
  SetPayloadExecutor,
  SetVariablesExecutor,
  WaitExecutor,
} from './node-executors';
import { ResourceFlowsExecutorServiceRouteContext } from './resource-flows-executor.service.route-context';
export abstract class FlowNodeExecutorRegistryImplementation extends ResourceFlowsExecutorServiceRouteContext {
  /**
   * Instantiates one executor per node type. Trigger/input nodes share a single
   * passthrough executor; the rest receive only the collaborators they need.
   * Executors are plain (non-DI) objects so the service keeps its DI signature.
   */
  protected buildNodeExecutorRegistry(): Record<ResourceFlowNodeType, NodeExecutor> {
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
      [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE]: new OperatingTransitionExecutor(
        this.operatingIntervals,
        'idle',
      ),

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

      [ResourceFlowNodeType.INPUT_METERING_START]: passthrough,
      [ResourceFlowNodeType.INPUT_METERING_COLLECT]: passthrough,
      [ResourceFlowNodeType.OUTPUT_METERING_READY]: new MeteringReadyExecutor(),
      [ResourceFlowNodeType.OUTPUT_METERING_REPORT]: new MeteringReportExecutor(),
    };
  }

  async onModuleInit() {
    await this.subscribeToMqttTopics();
  }

  protected async subscribeToMqttTopics() {
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

  protected getRepository<T>(
    entity: EntityTarget<T>,
    defaultRepository: Repository<T>,
    transactionManager?: EntityManager,
  ): Repository<T> {
    return transactionManager ? transactionManager.getRepository<T>(entity) : defaultRepository;
  }
}
