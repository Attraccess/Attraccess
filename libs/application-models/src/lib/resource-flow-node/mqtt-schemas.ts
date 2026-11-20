import { z } from 'zod';
import {
  AcknowledgementTimeoutSecondsSchema,
  CompletionBehaviorSchema,
  ExternalEffectPolicySchema,
} from './external-effect-policy';

const MqttServerIdSchema = z.number().int().positive().meta({
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
