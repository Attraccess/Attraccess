import { Logger } from '@nestjs/common';
import { ResourceFlowNode, MqttWaitForMessageNodeDataSchema } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import z from 'zod';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { MqttMessageEvent as MqttMessageReceivedEvent } from '../../../mqtt/mqtt-message.event';
import { NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { topicMatches } from './flow.utils';

export class MqttWaitForMessageExecutor implements NodeExecutor {
  private readonly logger = new Logger(MqttWaitForMessageExecutor.name);

  constructor(
    private readonly mqttClientService: MqttClientService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(node: ResourceFlowNode): Promise<NodeProcessingResult> {
    const { serverId, topic, timeoutSeconds, subscribeQos } = node.data as z.infer<
      typeof MqttWaitForMessageNodeDataSchema
    >;

    // Ensure subscription exists (wildcards allowed)
    await this.mqttClientService.subscribe(serverId, topic, subscribeQos as unknown as 0 | 1 | 2).catch((error) => {
      this.logger.error(`Failed to subscribe for wait node to topic ${topic} on server ${serverId}`, error.stack);
      throw error;
    });

    this.logger.debug(
      `Waiting for MQTT message (serverId=${serverId}, topicFilter=${topic}, timeout=${timeoutSeconds}s)`,
    );

    const result = await new Promise<{ topic: string; payload: unknown }>((resolve, reject) => {
      const onMessage = (event: MqttMessageReceivedEvent) => {
        if (event.serverId !== serverId) {
          return;
        }
        if (!topicMatches(topic, event.topic)) {
          return;
        }
        cleanup();
        resolve({ topic: event.topic, payload: event.payload });
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error(`Timeout waiting for MQTT message on topic '${topic}' (server ${serverId})`));
      };

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this.eventEmitter.off(MqttMessageReceivedEvent.EVENT_NAME, onMessage as unknown as () => void);
      };

      const timeoutHandle = setTimeout(onTimeout, timeoutSeconds * 1000);
      this.eventEmitter.on(MqttMessageReceivedEvent.EVENT_NAME, onMessage as unknown as () => void);
    });

    return { payload: { topic: result.topic, payload: result.payload } };
  }
}
