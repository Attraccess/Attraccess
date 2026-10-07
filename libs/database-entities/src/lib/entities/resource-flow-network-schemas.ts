import { z } from 'zod';
import {
  AcknowledgementTimeoutSecondsSchema,
  CompletionBehaviorSchema,
  ExternalEffectPolicySchema,
  ExternalEffectFailureBehavior,
} from './resource-flow-external-effect';
import { ResourceFlowNodeType } from './resource-flow-node-type';

export const HttpRequestNodeDataSchema = z
  .object({
    url: z.string().url('Invalid URL format'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    headers: z.record(z.string(), z.string()).optional().default({}),
    body: z.string().optional().default('').meta({
      stringVariant: 'multiline',
    }),
    timeoutSeconds: AcknowledgementTimeoutSecondsSchema,
    completionBehavior: CompletionBehaviorSchema.meta({
      helpText: 'Dispatch continues after the HTTP request is initiated. Acknowledged waits for the HTTP response.',
    }),
  })
  .extend(ExternalEffectPolicySchema.shape);

export const MqttServerIdSchema = z.number().int().positive().meta({
  selectFromEntity: 'mqttServer',
  entityProperty: 'id',
});

export const MqttSendMessageNodeDataSchema = z
  .object({
    serverId: MqttServerIdSchema,
    topic: z.string().min(1, 'Topic is required'),
    payload: z.string().optional().default('').meta({
      stringVariant: 'multiline',
    }),
    qos: z.number().min(0).max(2).optional().meta({
      helpText: 'Publish QoS: 0 (at most once), 1 (at least once), 2 (exactly once)',
    }),
    retain: z.boolean().optional().meta({
      helpText: 'Retain publishes: broker stores last message for new subscribers',
    }),
    completionBehavior: CompletionBehaviorSchema.meta({
      helpText:
        'Dispatch continues after the broker accepts the publish call. Acknowledged waits for the MQTT publish callback.',
    }),
    acknowledgementTimeoutSeconds: AcknowledgementTimeoutSecondsSchema,
  })
  .extend(ExternalEffectPolicySchema.shape);

export const MqttMessageReceivedNodeDataSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  serverId: MqttServerIdSchema,
});

export const MqttWaitForMessageNodeDataSchema = z
  .object({
    serverId: MqttServerIdSchema,
    topic: z.string().min(1, 'Topic is required'),
    timeoutSeconds: z.number().int().positive('Timeout must be a positive integer (seconds)'),
    subscribeQos: z.number().min(0).max(2).optional().meta({
      helpText:
        'Subscribe QoS sets the maximum delivery level for received messages; effective QoS is the lower of publisher and subscriber QoS.',
    }),
  })
  .extend(ExternalEffectPolicySchema.shape);

export const ResourceUsageEndSessionNodeDataSchema = z
  .object({
    notes: z.string().optional().meta({
      stringVariant: 'multiline',
    }),
  })
  .extend(ExternalEffectPolicySchema.shape)
  .optional();

export function getExternalEffectFailureBehavior(
  nodeType: ResourceFlowNodeType,
  data: unknown,
): ExternalEffectFailureBehavior | undefined {
  if (typeof data !== 'object' || data === null || !('failureBehavior' in data)) {
    return undefined;
  }

  switch (nodeType) {
    case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
      return HttpRequestNodeDataSchema.safeParse(data).data?.failureBehavior;
    case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
      return MqttSendMessageNodeDataSchema.safeParse(data).data?.failureBehavior;
    case ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE:
      return MqttWaitForMessageNodeDataSchema.safeParse(data).data?.failureBehavior;
    case ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION:
      return ResourceUsageEndSessionNodeDataSchema.safeParse(data).data?.failureBehavior;
    default:
      return undefined;
  }
}
