import { EntityManager } from 'typeorm';
import { ResourceFlowNode, ResourceFlowNodeType, ResourceUsage } from '@attraccess/database-entities';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { NodeProcessingResult } from './node-executors';
import { FlowExecutionOptions, FlowResourceContext, UsageEventData } from './flow-execution.types';

export abstract class ResourceFlowsExecutorServiceOnModuleInitContract {
  abstract onModuleInit(): Promise<void>;
  abstract handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent): Promise<void>;
  abstract triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void>;
  abstract startFlow(
    node: ResourceFlowNode | ResourceFlowNode[],
    data: NodeProcessingResult,
    transactionManager?: EntityManager,
    resourceContextCache?: Map<number, FlowResourceContext>,
    options?: FlowExecutionOptions,
  ): Promise<NodeProcessingResult[]>;
  abstract checkHealthHeartbeats(): Promise<void>;
  abstract checkResourceActivity(): Promise<void>;
  abstract handleResourceSessionStartedEvent(event: ResourceSessionStartedEvent): Promise<void>;
  protected abstract handleResourceUsage(usage: ResourceUsage, inputType: ResourceFlowNodeType): Promise<void>;
  protected abstract triggerResourceUsageNode(
    resourceId: number,
    eventType: ResourceFlowNodeType,
    eventData: UsageEventData,
  ): Promise<void>;
  abstract runFlow(
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    initialData?: object,
    transactionManager?: EntityManager,
    options?: FlowExecutionOptions,
  ): Promise<object[]>;
  abstract trackResourceActivity(resourceId: number): void;
  abstract getHeartbeatLastSeen(resourceId: number, identifier: string): Date | undefined;
  abstract handleCompanionIdle(event: { deviceId: number; payload: object }): Promise<void>;
  abstract handleCompanionActive(event: { deviceId: number; payload: object }): Promise<void>;
  abstract handleCompanionForegroundApp(event: { deviceId: number; payload: object }): Promise<void>;
  abstract handleCompanionUsbConnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void>;
  abstract handleCompanionUsbDisconnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void>;
  abstract pressButton(resourceId: number, buttonId: string, executingUserId: number): Promise<void>;
}
