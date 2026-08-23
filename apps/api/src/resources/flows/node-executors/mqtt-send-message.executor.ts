import { Logger } from '@nestjs/common';
import { ResourceFlowNode, MqttSendMessageNodeDataSchema } from '@attraccess/database-entities';
import z from 'zod';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

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
      await this.mqttClientService.publish(serverId, topic, payload, {
        qos: data.qos as 0 | 1 | 2,
        retain: data.retain as boolean,
      });
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

  private hasDescription(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.length > 0 || error.name.length > 0;
    }

    if (typeof error === 'string') {
      return error.length > 0;
    }

    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.length > 0
    );
  }
}
