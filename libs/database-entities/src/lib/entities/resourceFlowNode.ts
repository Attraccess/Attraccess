import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { Resource } from './resource.entity';
import { EventNodeDataSchema } from '../entities-index';

export enum ResourceFlowNodeType {
  INPUT_BUTTON = 'input.button',
  INPUT_RESOURCE_USAGE_STARTED = 'input.resource.usage.started',
  INPUT_RESOURCE_USAGE_STOPPED = 'input.resource.usage.stopped',
  INPUT_RESOURCE_USAGE_TAKEOVER = 'input.resource.usage.takeover',
  INPUT_RESOURCE_DOOR_UNLOCKED = 'input.resource.door.unlocked',
  INPUT_RESOURCE_DOOR_LOCKED = 'input.resource.door.locked',
  INPUT_RESOURCE_DOOR_UNLATCHED = 'input.resource.door.unlatched',
  INPUT_MQTT_MESSAGE_RECEIVED = 'input.mqtt.message.received',
  INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY = 'input.resource.activity.no-activity',
  INPUT_VARIABLE_CHANGED = 'input.variable.changed',
  OUTPUT_HTTP_SEND_REQUEST = 'output.http.sendRequest',
  OUTPUT_MQTT_SEND_MESSAGE = 'output.mqtt.sendMessage',
  OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS = 'output.resource.billing.calculation.set-additional-items',
  OUTPUT_RESOURCE_USAGE_END_SESSION = 'output.resource.usage.end-session',
  OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY = 'output.resource.activity.track-activity',
  OUTPUT_RESOURCE_OPERATING = 'output.resource.operating',
  OUTPUT_RESOURCE_IDLE = 'output.resource.idle',
  PROCESSING_WAIT = 'processing.wait',
  PROCESSING_IF = 'processing.if',
  PROCESSING_SET_PAYLOAD = 'processing.set-payload',
  PROCESSING_MQTT_WAIT_FOR_MESSAGE = 'processing.mqtt.waitForMessage',
  PROCESSING_ERROR = 'processing.error',
  PROCESSING_SET_VARIABLES = 'processing.variables.set',
  PROCESSING_GET_VARIABLES = 'processing.variables.get',
  OUTPUT_RESOURCE_HEALTH_HEARTBEAT = 'output.resource.health.heartbeat',
  OUTPUT_RESOURCE_HEALTH_SET = 'output.resource.health.set',
  OUTPUT_COMPANION_LOCK_PC = 'output.companion.lock-pc',
  OUTPUT_COMPANION_UNLOCK_PC = 'output.companion.unlock-pc',
  INPUT_COMPANION_IDLE = 'input.companion.idle',
  INPUT_COMPANION_ACTIVE = 'input.companion.active',
  INPUT_COMPANION_FOREGROUND_APP_CHANGED = 'input.companion.foreground_app_changed',
  INPUT_COMPANION_USB_DEVICE_CONNECTED = 'input.companion.usb_device_connected',
  INPUT_COMPANION_USB_DEVICE_DISCONNECTED = 'input.companion.usb_device_disconnected',
}

// Zod schemas for node data validation
export const VariableScopeSchema = z.enum(['resource', 'global']);

const VariableKeySchema = z.string().min(1, 'Key is required');

export const NodeWithoutDataSchema = z.object({}).optional();

export const ButtonNodeDataSchema = z.object({
  label: z.string().min(1, 'Label is required'),
});

export const ExternalEffectFailureBehaviorSchema = z
  .enum(['fail-flow', 'failure-output', 'log-and-continue'])
  .default('log-and-continue')
  .meta({
    helpText:
      'fail-flow aborts the triggering operation, failure-output routes the error through the failure handle, and log-and-continue records the error and continues normally.',
  });

export const ExternalEffectPolicySchema = z.object({
  failureBehavior: ExternalEffectFailureBehaviorSchema,
});

export type ExternalEffectFailureBehavior = z.infer<typeof ExternalEffectFailureBehaviorSchema>;

const AcknowledgementTimeoutSecondsSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483, 'Timeout exceeds the supported timer limit')
  .optional()
  .meta({
    helpText: 'Maximum time to wait for an acknowledgement, in seconds. Leave empty to use the integration default.',
  });

const CompletionBehaviorSchema = z.enum(['dispatch', 'acknowledged']).default('acknowledged');

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
      helpText:
        'Dispatch continues after the HTTP request is initiated. Acknowledged waits for the HTTP response.',
    }),
  })
  .extend(ExternalEffectPolicySchema.shape);

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

export const WaitNodeDataSchema = z.object({
  duration: z.number().int().positive('Duration must be a positive integer'),
  unit: z.enum(['seconds', 'minutes', 'hours']),
});

export const IfNodeDataSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  comparisonOperator: z.enum(['=', '!=', '>', '<', '>=', '<=']),
  comparisonValueIsPath: z.boolean().default(false),
  comparisonValue: z.string().min(1, 'Comparison value is required'),
});

export const BillingTransactionItemCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  unitPrice: z.number().int().meta({
    isCurrency: true,
  }),
  quantity: z.coerce.number().int().positive().meta({
    overrideWithInput: 'quantity',
  }),
  description: z.string().optional().meta({
    stringVariant: 'multiline',
  }),
  externalReference: z.string().optional().meta({
    overrideWithInput: 'externalReference',
  }),
});

export const ResourceActivityTrackActivityNodeDataSchema = z.object({});
export const ResourceOperatingTransitionNodeDataSchema = z.object({});

export const MqttMessageReceivedNodeDataSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  serverId: MqttServerIdSchema,
});

export const InputResourceActivityNoActivityNodeDataSchema = z.object({
  minInactivityMinutes: z
    .number()
    .int()
    .positive()
    .describe('Duration in minutes that the resource needs to be inactive before this node is triggered'),
});

export const SetPayloadNodeDataSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().min(1, 'Key is required'),
        value: z.string().optional().default('').meta({
          stringVariant: 'multiline',
        }),
      }),
    )
    .default([]),
});

export const SetVariablesNodeDataSchema = z.object({
  variables: z
    .array(
      z.object({
        key: VariableKeySchema,
        value: z.string().optional().default('').meta({ stringVariant: 'multiline' }),
        scope: VariableScopeSchema,
      }),
    )
    .min(1, 'At least one variable is required'),
});

export const GetVariablesNodeDataSchema = z.object({
  variables: z
    .array(
      z.object({
        key: VariableKeySchema,
        scope: VariableScopeSchema,
        payloadPath: z.string().min(1, 'Payload path is required'),
      }),
    )
    .min(1, 'At least one variable is required'),
});

export const VariableChangedNodeDataSchema = z.object({
  watches: z
    .array(z.object({ key: VariableKeySchema, scope: VariableScopeSchema }))
    .min(1, 'At least one watch is required'),
  source: z.enum(['any', 'exclude-self']).default('any'),
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

export const ErrorNodeDataSchema = z.object({
  message: z.string().min(1),
});

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

export const HealthStateOptionEnum = z.enum(['healthy', 'unhealthy']);

export const ResourceHealthHeartbeatNodeDataSchema = z.object({
  identifier: z.string().optional().default('').meta({
    helpText:
      'Optional label identifying which subsystem reports this heartbeat (e.g. "Shelly"). Leave empty for the resource default.',
  }),
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .describe('If no heartbeat is received within this many seconds, the resource is marked unhealthy'),
  unhealthyReason: z.string().optional().default('').meta({
    helpText: 'Reason recorded when the heartbeat times out (e.g. "no heartbeat received")',
  }),
});

export const ResourceHealthSetNodeDataSchema = z.object({
  identifier: z.string().optional().default('').meta({
    overrideWithInput: 'health.identifier',
    helpText:
      'Optional label identifying which subsystem this state refers to (e.g. "Shelly"). Overridable via payload path "health.identifier".',
  }),
  status: HealthStateOptionEnum.meta({
    overrideWithInput: 'health.status',
    helpText:
      'Static status for this node. Overridable via payload path "health.status" (must be "healthy" or "unhealthy").',
  }),
  reason: z.string().optional().default('').meta({
    overrideWithInput: 'health.reason',
    helpText:
      'Optional reason shown to users when unhealthy. Templates allowed. Overridable via payload path "health.reason".',
    stringVariant: 'multiline',
  }),
});

const CompanionDeviceIdSchema = z.number().int().positive().meta({
  selectFromEntity: 'companionDevice',
  entityProperty: 'id',
});

export const CompanionLockNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
});

export const CompanionIdleActiveNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
});

export const CompanionForegroundAppNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
});

export const CompanionUsbDeviceNodeDataSchema = z.object({
  deviceId: CompanionDeviceIdSchema,
  vendorId: z.number().int().optional().meta({
    helpText: 'Optional USB vendor ID filter (decimal). Leave empty to match any vendor.',
  }),
  productId: z.number().int().optional().meta({
    helpText: 'Optional USB product ID filter (decimal). Leave empty to match any product.',
  }),
});

// Helper function to get the appropriate schema for a node type
export function getNodeDataSchema(nodeType: ResourceFlowNodeType) {
  switch (nodeType) {
    case ResourceFlowNodeType.INPUT_BUTTON:
      return ButtonNodeDataSchema;

    case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
    case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
    case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
    case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
    case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
    case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
      return EventNodeDataSchema;

    case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
      return MqttMessageReceivedNodeDataSchema;

    case ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY:
      return InputResourceActivityNoActivityNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
      return BillingTransactionItemCreateSchema;

    case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
      return HttpRequestNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
      return MqttSendMessageNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_WAIT:
      return WaitNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_IF:
      return IfNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_SET_PAYLOAD:
      return SetPayloadNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE:
      return MqttWaitForMessageNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_ERROR:
      return ErrorNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION:
      return ResourceUsageEndSessionNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY:
      return ResourceActivityTrackActivityNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_RESOURCE_OPERATING:
    case ResourceFlowNodeType.OUTPUT_RESOURCE_IDLE:
      return ResourceOperatingTransitionNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT:
      return ResourceHealthHeartbeatNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET:
      return ResourceHealthSetNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_SET_VARIABLES:
      return SetVariablesNodeDataSchema;

    case ResourceFlowNodeType.PROCESSING_GET_VARIABLES:
      return GetVariablesNodeDataSchema;

    case ResourceFlowNodeType.INPUT_VARIABLE_CHANGED:
      return VariableChangedNodeDataSchema;

    case ResourceFlowNodeType.OUTPUT_COMPANION_LOCK_PC:
    case ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC:
      return CompanionLockNodeDataSchema;

    case ResourceFlowNodeType.INPUT_COMPANION_IDLE:
    case ResourceFlowNodeType.INPUT_COMPANION_ACTIVE:
      return CompanionIdleActiveNodeDataSchema;

    case ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED:
      return CompanionForegroundAppNodeDataSchema;

    case ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED:
    case ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED:
      return CompanionUsbDeviceNodeDataSchema;

    default: {
      const exhaustiveCheck: never = nodeType;
      throw new Error(`Unknown node type: ${exhaustiveCheck}`);
    }
  }
}

export class ResourceFlowNodePosition {
  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The x position of the node',
    example: 100,
  })
  x!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The y position of the node',
    example: 100,
  })
  y!: number;
}

@Entity()
export class ResourceFlowNode {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({
    description: 'The unique identifier of the resource flow node',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  id!: string;

  @Column({
    type: 'varchar',
  })
  @ApiProperty({
    description: 'The type of the node',
    example: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    enum: ResourceFlowNodeType,
    enumName: 'ResourceFlowNodeType',
  })
  type!: ResourceFlowNodeType;

  @Column(() => ResourceFlowNodePosition)
  @ApiProperty({
    description: 'The position of the node',
    example: { x: 100, y: 100 },
  })
  position!: ResourceFlowNodePosition;

  @Column({ type: 'json', nullable: true })
  @ApiProperty({
    description: 'The data of the node, depending on the type of the node',
    example: {
      url: 'https://example.com',
      method: 'GET',
    },
  })
  data!: Record<string, unknown>;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the node was created',
    type: String,
    format: 'date-time',
    required: false,
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the node was last updated',
    type: String,
    format: 'date-time',
    required: false,
  })
  updatedAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The id of the resource that this node belongs to',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.flowNodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being this node belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;
}
