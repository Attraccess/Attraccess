import { BillingTransactionItem, ResourceFlowNodeType } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { ResourceUsageService } from '../../usage/resourceUsage.service';
import { ResourceHealthService } from '../../health/resource-health.service';
import { ResourceFlowVariablesService } from '../resource-flow-variables.service';
import { ResourceOperatingIntervalService } from '../../operating-intervals/resource-operating-interval.service';
import { CompanionGatewayService } from '../../../companion/companion-gateway.service';
import { ResourceMeteringService } from '../../metering/resource-metering.service';
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
  MeteringReadyExecutor,
  MeteringReportExecutor,
  NodeExecutor,
  PassthroughExecutor,
  SetPayloadExecutor,
  SetVariablesExecutor,
  WaitExecutor,
} from '../node-executors';

interface ExecutorDependencies {
  resourceActivity: Map<number, Date>;
  heartbeatLastSeen: Map<string, Date>;
  resourceHealthService: ResourceHealthService;
  resourceUsageService: ResourceUsageService;
  billingTransactionItemRepository: Repository<BillingTransactionItem>;
  mqttClientService: MqttClientService;
  operatingIntervals: ResourceOperatingIntervalService;
  eventEmitter: EventEmitter2;
  variablesService: ResourceFlowVariablesService;
  companionGatewayService: CompanionGatewayService;
  metering: ResourceMeteringService;
}

/** Exhaustive core-node registry; each strategy receives only the collaborators it needs. */
export function buildNodeExecutorRegistry(
  dependencies: ExecutorDependencies,
): Record<ResourceFlowNodeType, NodeExecutor> {
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
      dependencies.resourceHealthService,
      dependencies.heartbeatLastSeen,
    ),
    [ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET]: new HealthSetExecutor(dependencies.resourceHealthService),
    [ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS]: new BillingSetAdditionalItemsExecutor(
      dependencies.resourceUsageService,
      dependencies.billingTransactionItemRepository,
    ),
    [ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST]: new HttpSendRequestExecutor(),
    [ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE]: new MqttSendMessageExecutor(dependencies.mqttClientService),
    [ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION]: new EndUsageSessionExecutor(
      dependencies.resourceUsageService,
    ),
    [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY]: new ActivityTrackExecutor(
      dependencies.resourceActivity,
    ),
    [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_OPERATING]: new OperatingTransitionExecutor(
      dependencies.operatingIntervals,
      'operating',
    ),
    [ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_IDLE]: new OperatingTransitionExecutor(
      dependencies.operatingIntervals,
      'idle',
    ),

    [ResourceFlowNodeType.PROCESSING_WAIT]: new WaitExecutor(),
    [ResourceFlowNodeType.PROCESSING_IF]: new IfExecutor(),
    [ResourceFlowNodeType.PROCESSING_SET_PAYLOAD]: new SetPayloadExecutor(),
    [ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE]: new MqttWaitForMessageExecutor(
      dependencies.mqttClientService,
      dependencies.eventEmitter,
    ),
    [ResourceFlowNodeType.PROCESSING_ERROR]: new ErrorExecutor(),
    [ResourceFlowNodeType.PROCESSING_SET_VARIABLES]: new SetVariablesExecutor(dependencies.variablesService),
    [ResourceFlowNodeType.PROCESSING_GET_VARIABLES]: new GetVariablesExecutor(dependencies.variablesService),

    [ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC]: new CompanionLockPcExecutor(dependencies.companionGatewayService),
    [ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC]: new CompanionUnlockPcExecutor(
      dependencies.companionGatewayService,
    ),
    [ResourceFlowNodeType.INPUT_COMPANION_IDLE]: passthrough,
    [ResourceFlowNodeType.INPUT_COMPANION_ACTIVE]: passthrough,
    [ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED]: passthrough,
    [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED]: passthrough,
    [ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED]: passthrough,

    [ResourceFlowNodeType.INPUT_METERING_START]: passthrough,
    [ResourceFlowNodeType.INPUT_METERING_COLLECT]: passthrough,
    [ResourceFlowNodeType.OUTPUT_METERING_READY]: new MeteringReadyExecutor(),
    [ResourceFlowNodeType.OUTPUT_METERING_REPORT]: new MeteringReportExecutor(dependencies.metering),
  };
}
