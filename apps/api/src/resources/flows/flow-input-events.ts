import {
  MqttMessageReceivedNodeDataSchema,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageAction,
} from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { EntityManager } from 'typeorm';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../mqtt/mqtt-message.event';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';
import { FlowResourceContextImplementation } from './flow-resource-context';
import { topicMatches } from './node-executors';
import { FlowExecutionOptions, UsageEventData } from './resource-flows-executor.service.feature-definitions';

export abstract class FlowInputEventsImplementation extends FlowResourceContextImplementation {
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

  @OnEvent(MqttMessageReceivedEvent.EVENT_NAME)
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

  protected async handleResourceUsage(usage: ResourceUsage, inputType: ResourceFlowNodeType) {
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

  protected async triggerResourceUsageNode(
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
    const repository = this.getRepository(ResourceFlowNode, this.flowNodeRepository, transactionManager);

    const nodes = await repository.find({
      where: {
        resourceId,
        type: triggerNodeType,
      },
    });

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
}
