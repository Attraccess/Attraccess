import { Injectable, LoggerService } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../mqtt/mqtt-client.service';
import { MqttMessageEvent } from '../mqtt/mqtt-message.event';
import type { PluginMqttMessage, PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';

interface Subscription {
  pluginId: string;
  pluginName: string;
  serverId: number;
  topicFilter: string;
  handler: (message: PluginMqttMessage) => void | Promise<void>;
  logger: LoggerService;
}

export function mqttTopicMatches(topicFilter: string, topic: string): boolean {
  const filterLevels = topicFilter.split('/');
  const topicLevels = topic.split('/');

  return (
    filterLevels.every((filterLevel, index) => {
      if (filterLevel === '#') {
        return index === filterLevels.length - 1;
      }
      return filterLevel === '+' || filterLevel === topicLevels[index];
    }) &&
    (filterLevels.at(-1) === '#' || filterLevels.length === topicLevels.length)
  );
}

/** Routes shared-client MQTT messages to the plugin handlers that requested them. */
@Injectable()
export class PluginMqttService {
  private readonly subscriptions = new Set<Subscription>();

  constructor(
    private readonly mqtt: MqttClientService,
    events: EventEmitter2,
  ) {
    events.on(MqttMessageEvent.EVENT_NAME, (event: MqttMessageEvent) => this.deliver(event));
  }

  subscribe(
    pluginId: string,
    pluginName: string,
    logger: LoggerService,
    serverId: number,
    topicFilter: string,
    handler: Subscription['handler'],
  ): PluginMqttSubscription {
    const subscription = { pluginId, pluginName, logger, serverId, topicFilter, handler };
    this.subscriptions.add(subscription);
    void this.mqtt.subscribe(serverId, topicFilter);

    return { unsubscribe: () => this.unsubscribe(subscription) };
  }

  async publish(
    serverId: number,
    topic: string,
    payload: string | Buffer,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
  ): Promise<void> {
    await this.mqtt.publish(serverId, topic, payload, options);
  }

  clearPlugin(pluginId: string): void {
    for (const subscription of this.subscriptions) {
      if (subscription.pluginId === pluginId) {
        this.unsubscribe(subscription);
      }
    }
  }

  private unsubscribe(subscription: Subscription): void {
    if (!this.subscriptions.delete(subscription)) {
      return;
    }
    // MqttClientService reference-counts topic filters across plugins.
    void this.mqtt.unsubscribe(subscription.serverId, subscription.topicFilter).catch((error) => {
      subscription.logger.error(
        `Failed to unsubscribe from MQTT topic "${subscription.topicFilter}"`,
        (error as Error).stack,
      );
    });
  }

  private deliver(event: MqttMessageEvent): void {
    for (const subscription of this.subscriptions) {
      if (subscription.serverId !== event.serverId || !mqttTopicMatches(subscription.topicFilter, event.topic)) {
        continue;
      }
      Promise.resolve()
        .then(() =>
          subscription.handler({ serverId: event.serverId, topic: event.topic, payload: event.payloadBuffer }),
        )
        .catch((error) => {
          subscription.logger.error(`MQTT handler for "${subscription.topicFilter}" failed`, (error as Error).stack);
        });
    }
  }
}
