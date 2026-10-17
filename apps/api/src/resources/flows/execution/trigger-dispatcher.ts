import { Logger } from '@nestjs/common';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  MqttMessageReceivedNodeDataSchema,
  MqttWaitForMessageNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
} from '@attraccess/database-entities';
import { MoreThan, Repository } from 'typeorm';
import z from 'zod';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../../mqtt/mqtt-message.event';
import { CompanionUsbDeviceDto } from '../../../companion/companion.types';
import { getPluginFlowNode, getPluginFlowNodeOwner } from '../../../plugin-system/flows/node-registry';
import { NodeProcessingResult, topicMatches } from '../node-executors';

/** Finds matching external-event trigger nodes and preserves plugin lookup ordering. */
export class FlowTriggerDispatcher {
  private pluginFlowLookupQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
    private readonly mqttClientService: MqttClientService,
    private readonly startFlow: (
      nodes: ResourceFlowNode | ResourceFlowNode[],
      data: NodeProcessingResult,
    ) => Promise<NodeProcessingResult[]>,
    private readonly logger: Logger,
  ) {}

  async subscribeToMqttTopics() {
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

  async handleMqttMessageReceivedEvent(event: MqttMessageReceivedEvent) {
    const { topic, payload, serverId } = event;

    const messageReceivedNodes = await this.flowNodeRepository.find({
      where: {
        type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
      },
    });

    const filteredMessageReceivedNodes = messageReceivedNodes.filter((node) => {
      const { serverId: nodeServerId, topic: nodeTopic } = MqttMessageReceivedNodeDataSchema.parse(node.data);
      return nodeServerId === serverId && (topicMatches(nodeTopic, topic) || topicMatches(topic, nodeTopic));
    });

    if (filteredMessageReceivedNodes.length === 0) {
      this.logger.debug(`No flow nodes found for server ID: ${serverId} and topic: ${topic}`);
      return;
    }

    this.logger.log(`Found ${filteredMessageReceivedNodes.length} flow node(s) for topic: ${topic}`);

    await this.startFlow(filteredMessageReceivedNodes, { payload: { serverId, topic, payload } });
  }

  public async triggerPluginFlows(
    pluginName: string,
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void> {
    const definition = getPluginFlowNode(nodeType);
    if (
      !nodeType.startsWith(`plugin.${pluginName}.`) ||
      !definition?.isInput ||
      getPluginFlowNodeOwner(nodeType) !== pluginName
    ) {
      throw new Error(`Plugin flow node type "${nodeType}" is not a registered trigger node.`);
    }

    const pageSize = 100;
    const concurrency = 10;
    let lastId: string | undefined;
    for (;;) {
      const nodes = await this.queuedPluginFlowLookup(() =>
        this.flowNodeRepository.find({
          where: {
            type: nodeType as ResourceFlowNodeType,
            ...(lastId ? { id: MoreThan(lastId) } : {}),
          },
          order: { id: 'ASC' },
          take: pageSize,
        }),
      );

      if (nodes.length === 0) return;
      lastId = nodes[nodes.length - 1].id;

      for (let offset = 0; offset < nodes.length; offset += concurrency) {
        await Promise.allSettled(
          nodes.slice(offset, offset + concurrency).map(async (node) => {
            let isMatch: boolean;
            try {
              isMatch = matches(node.data as Record<string, unknown>, node.id);
            } catch (error) {
              this.logger.error(
                `Failed to match plugin flow trigger node ID: ${node.id} (Type: ${nodeType})`,
                error instanceof Error ? error.stack : undefined,
              );
              return;
            }

            if (isMatch) {
              await this.startFlow(node, { payload });
            }
          }),
        );
      }

      if (nodes.length < pageSize) return;
    }
  }

  private queuedPluginFlowLookup(lookup: () => Promise<ResourceFlowNode[]>): Promise<ResourceFlowNode[]> {
    const queued = this.pluginFlowLookupQueue.then(lookup, lookup);
    this.pluginFlowLookupQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  async triggerCompanionEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: object,
    schema: { safeParse: (d: unknown) => { success: boolean; data?: { deviceId: number } } },
  ): Promise<void> {
    const allNodes = await this.flowNodeRepository.find({ where: { type } });
    const matching = allNodes.filter((node) => {
      const parsed = schema.safeParse(node.data ?? {});
      return parsed.success && parsed.data?.deviceId === deviceId;
    });
    if (matching.length === 0) return;
    await this.startFlow(matching, { payload });
  }

  async triggerUsbDeviceEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: CompanionUsbDeviceDto,
  ): Promise<void> {
    const allNodes = await this.flowNodeRepository.find({ where: { type } });
    const matching = allNodes.filter((node) => {
      const parsed = CompanionUsbDeviceNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success || parsed.data.deviceId !== deviceId) return false;
      const { vendorId, productId } = parsed.data;
      const hasVendorFilter = vendorId !== undefined;
      const hasProductFilter = productId !== undefined;
      if (hasVendorFilter && hasProductFilter) {
        return vendorId === payload.vendorId && productId === payload.productId;
      }
      if (hasVendorFilter) return vendorId === payload.vendorId;
      if (hasProductFilter) return productId === payload.productId;
      return true;
    });
    if (matching.length === 0) return;
    await this.startFlow(matching, { payload });
  }
}
