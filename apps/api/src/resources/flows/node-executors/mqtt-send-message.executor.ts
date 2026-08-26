import { Logger } from '@nestjs/common';
import { ResourceFlowNode, MqttSendMessageNodeDataSchema } from '@attraccess/database-entities';
import z from 'zod';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { FlowFailureKind, NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class MqttSendMessageExecutor implements NodeExecutor {
  private readonly logger = new Logger(MqttSendMessageExecutor.name);

  constructor(private readonly mqttClientService: MqttClientService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { serverId, ...data } = node.data as z.infer<typeof MqttSendMessageNodeDataSchema>;

    const topic = ctx.compileTemplate(data.topic ?? '', input);
    const payload = ctx.compileTemplate(data.payload ?? '', input);

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
      );
    }

    return {
      payload: input,
    };
  }

  getFailureKind(error: unknown): FlowFailureKind {
    return error instanceof Error && error.name === 'MqttAcknowledgementTimeoutError'
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
