import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FlowNodeRecord, MqttSendMessageNodeDataSchema } from '@attraccess/application-models';
import z from 'zod';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { MqttMessageEvent } from '../../../mqtt/mqtt-message.event';
import { topicMatches } from './flow.utils';
import { FlowFailureKind, NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

type MqttSendMessageNodeData = z.infer<typeof MqttSendMessageNodeDataSchema>;

const DEFAULT_RESPONSE_TIMEOUT_SECONDS = 10;

class MqttResponseTimeoutError extends Error {
  constructor(topic: string, serverId: number, timeoutSeconds: number) {
    super(`No MQTT reply on topic '${topic}' (server ${serverId}) within ${timeoutSeconds}s`);
    this.name = 'MqttResponseTimeoutError';
  }
}

export class MqttSendMessageExecutor implements NodeExecutor {
  private readonly logger = new Logger(MqttSendMessageExecutor.name);

  constructor(
    private readonly mqttClientService: MqttClientService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(node: FlowNodeRecord, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { serverId, ...data } = node.data as MqttSendMessageNodeData;

    const topic = ctx.compileTemplate(data.topic ?? '', input);
    const payload = ctx.compileTemplate(data.payload ?? '', input);
    const responseTopic = data.responseTopic?.trim() ? ctx.compileTemplate(data.responseTopic, input).trim() : '';

    if (!responseTopic) {
      await this.publish(serverId, topic, payload, data);
      return { payload: input };
    }

    const response = await this.request(
      serverId,
      responseTopic,
      data.responseTimeoutSeconds ?? DEFAULT_RESPONSE_TIMEOUT_SECONDS,
      () => this.publish(serverId, topic, payload, data),
    );
    return { payload: { ...input, response } };
  }

  /**
   * Publishes and returns the first reply on the response topic. The listener and the subscription are in place
   * before the message goes out: a device often answers before the publish acknowledgement arrives, which a
   * following "Wait for MQTT message" node would miss.
   */
  private async request(
    serverId: number,
    responseTopic: string,
    timeoutSeconds: number,
    publish: () => Promise<void>,
  ): Promise<{ topic: string; payload: unknown }> {
    let onMessage: (event: MqttMessageEvent) => void = () => undefined;
    const reply = new Promise<{ topic: string; payload: unknown }>((resolve) => {
      onMessage = (event) => {
        // A retained message the broker replays on subscribe is an old value, not the reply.
        if (event.serverId !== serverId || event.retained || !topicMatches(responseTopic, event.topic)) return;
        resolve({ topic: event.topic, payload: event.payload });
      };
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.eventEmitter.on(MqttMessageEvent.EVENT_NAME, onMessage as unknown as () => void);
    try {
      await this.mqttClientService.subscribe(serverId, responseTopic, undefined, true);
      await publish();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new MqttResponseTimeoutError(responseTopic, serverId, timeoutSeconds)),
          timeoutSeconds * 1000,
        );
      });
      return await Promise.race([reply, timeout]);
    } finally {
      clearTimeout(timer);
      this.eventEmitter.off(MqttMessageEvent.EVENT_NAME, onMessage as unknown as () => void);
      await this.mqttClientService.unsubscribe(serverId, responseTopic, undefined).catch((error: unknown) => {
        this.logger.warn(`Failed to unsubscribe from reply topic ${responseTopic} on server ${serverId}: ${error}`);
      });
    }
  }

  private async publish(
    serverId: number,
    topic: string,
    payload: string,
    data: Omit<MqttSendMessageNodeData, 'serverId'>,
  ) {
    this.logger.debug(
      `Publishing MQTT message to server ID: ${serverId} with topic: ${topic} and payload: "${payload}"`,
    );

    try {
      const options = {
        qos: data.qos as 0 | 1 | 2,
        retain: data.retain as boolean,
      };
      const completion =
        data.completionBehavior || data.acknowledgementTimeoutSeconds
          ? {
              awaitAcknowledgement: data.completionBehavior !== 'dispatch',
              acknowledgementTimeoutSeconds: data.acknowledgementTimeoutSeconds,
            }
          : undefined;

      if (completion) {
        await this.mqttClientService.publish(serverId, topic, payload, options, completion);
      } else {
        await this.mqttClientService.publish(serverId, topic, payload, options);
      }
    } catch (error) {
      if (this.hasDescription(error)) {
        throw error;
      }

      throw new Error(
        `Failed to publish MQTT message to topic '${topic}' on server ${serverId}: no error details were provided`,
        { cause: error },
      );
    }
  }

  getFailureKind(error: unknown): FlowFailureKind {
    return error instanceof Error &&
      (error.name === 'MqttAcknowledgementTimeoutError' || error.name === 'MqttResponseTimeoutError')
      ? 'acknowledgement-timeout'
      : 'transport-dispatch';
  }

  private hasDescription(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.length > 0 || error.name.length > 0;
    }

    if (typeof error === 'string') {
      return error.trim().length > 0;
    }

    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.trim().length > 0
    );
  }
}
