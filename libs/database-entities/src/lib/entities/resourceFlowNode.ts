import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { Resource } from './resource.entity';
import { EventNodeDataSchema } from '../entities-index';

export enum ResourceFlowNodeType {
  MANUAL_BUTTON = 'manual.button',
  RESOURCE_USAGE_STARTED = 'resource.usage.started',
  RESOURCE_USAGE_STOPPED = 'resource.usage.stopped',
  RESOURCE_USAGE_TAKEOVER = 'resource.usage.takeover',
  RESOURCE_USAGE_END_SESSION = 'resource.usage.end-session',
  RESOURCE_ACTIVITY_NO_ACTIVITY = 'resource.activity.no-activity',
  RESOURCE_ACTIVITY_TRACK_ACTIVITY = 'resource.activity.track-activity',
  RESOURCE_BILLING_SET_ADDITIONAL_ITEMS = 'resource.billing.set-additional-items',
  DOOR_UNLOCKED = 'door.unlocked',
  DOOR_LOCKED = 'door.locked',
  DOOR_UNLATCHED = 'door.unlatched',
  MQTT_MESSAGE_RECEIVED = 'mqtt.message.received',
  MQTT_SEND_MESSAGE = 'mqtt.send-message',
  MQTT_WAIT_FOR_MESSAGE = 'mqtt.wait-for-message',
  HTTP_SEND_REQUEST = 'http.send-request',
  LOGIC_WAIT = 'logic.wait',
  LOGIC_IF = 'logic.if',
  LOGIC_SET_PAYLOAD = 'logic.set-payload',
  LOGIC_ERROR = 'logic.error',
  HEALTH_HEARTBEAT = 'health.heartbeat',
  HEALTH_SET = 'health.set',
}

// Zod schemas for node data validation
export const NodeWithoutDataSchema = z.object({}).optional();

export const ButtonNodeDataSchema = z.object({
  label: z.string().min(1, 'Label is required'),
});

export const HttpRequestNodeDataSchema = z.object({
  url: z.string().url('Invalid URL format'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default('').meta({
    stringVariant: 'multiline',
  }),
});

const MqttServerIdSchema = z.number().int().positive().meta({
  selectFromEntity: 'mqttServer',
  entityProperty: 'id',
});

export const MqttSendMessageNodeDataSchema = z.object({
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
});

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

export const MqttWaitForMessageNodeDataSchema = z.object({
  serverId: MqttServerIdSchema,
  topic: z.string().min(1, 'Topic is required'),
  timeoutSeconds: z.number().int().positive('Timeout must be a positive integer (seconds)'),
  subscribeQos: z.number().min(0).max(2).optional().meta({
    helpText:
      'Subscribe QoS sets the maximum delivery level for received messages; effective QoS is the lower of publisher and subscriber QoS.',
  }),
});

export const ErrorNodeDataSchema = z.object({
  message: z.string().min(1),
});

export const ResourceUsageEndSessionNodeDataSchema = z
  .object({
    notes: z.string().optional().meta({
      stringVariant: 'multiline',
    }),
  })
  .optional();

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

// Helper function to get the appropriate schema for a node type
export function getNodeDataSchema(nodeType: ResourceFlowNodeType) {
  switch (nodeType) {
    case ResourceFlowNodeType.MANUAL_BUTTON:
      return ButtonNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_USAGE_STARTED:
    case ResourceFlowNodeType.RESOURCE_USAGE_STOPPED:
    case ResourceFlowNodeType.RESOURCE_USAGE_TAKEOVER:
    case ResourceFlowNodeType.DOOR_UNLOCKED:
    case ResourceFlowNodeType.DOOR_LOCKED:
    case ResourceFlowNodeType.DOOR_UNLATCHED:
      return EventNodeDataSchema;

    case ResourceFlowNodeType.MQTT_MESSAGE_RECEIVED:
      return MqttMessageReceivedNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_ACTIVITY_NO_ACTIVITY:
      return InputResourceActivityNoActivityNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS:
      return BillingTransactionItemCreateSchema;

    case ResourceFlowNodeType.HTTP_SEND_REQUEST:
      return HttpRequestNodeDataSchema;

    case ResourceFlowNodeType.MQTT_SEND_MESSAGE:
      return MqttSendMessageNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_WAIT:
      return WaitNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_IF:
      return IfNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_SET_PAYLOAD:
      return SetPayloadNodeDataSchema;

    case ResourceFlowNodeType.MQTT_WAIT_FOR_MESSAGE:
      return MqttWaitForMessageNodeDataSchema;

    case ResourceFlowNodeType.LOGIC_ERROR:
      return ErrorNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_USAGE_END_SESSION:
      return ResourceUsageEndSessionNodeDataSchema;

    case ResourceFlowNodeType.RESOURCE_ACTIVITY_TRACK_ACTIVITY:
      return ResourceActivityTrackActivityNodeDataSchema;

    case ResourceFlowNodeType.HEALTH_HEARTBEAT:
      return ResourceHealthHeartbeatNodeDataSchema;

    case ResourceFlowNodeType.HEALTH_SET:
      return ResourceHealthSetNodeDataSchema;

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
    example: ResourceFlowNodeType.RESOURCE_USAGE_STARTED,
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
