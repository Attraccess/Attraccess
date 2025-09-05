import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { Resource } from './resource.entity';

export enum ResourceFlowNodeType {
  INPUT_BUTTON = 'input.button',
  INPUT_RESOURCE_USAGE_STARTED = 'input.resource.usage.started',
  INPUT_RESOURCE_USAGE_STOPPED = 'input.resource.usage.stopped',
  INPUT_RESOURCE_USAGE_TAKEOVER = 'input.resource.usage.takeover',
  INPUT_RESOURCE_DOOR_UNLOCKED = 'input.resource.door.unlocked',
  INPUT_RESOURCE_DOOR_LOCKED = 'input.resource.door.locked',
  INPUT_RESOURCE_DOOR_UNLATCHED = 'input.resource.door.unlatched',
  OUTPUT_HTTP_SEND_REQUEST = 'output.http.sendRequest',
  OUTPUT_MQTT_SEND_MESSAGE = 'output.mqtt.sendMessage',
  PROCESSING_WAIT = 'processing.wait',
  PROCESSING_IF = 'processing.if',
}

// Zod schemas for node data validation
export const EventNodeDataSchema = z.object({}).optional();

export const HttpRequestNodeDataSchema = z.object({
  url: z.string().url('Invalid URL format'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], {
    errorMap: () => ({ message: 'Method must be one of: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS' }),
  }),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default(''),
});

export const MqttSendMessageNodeDataSchema = z.object({
  serverId: z.number().int().positive('Server ID must be a positive integer'),
  topic: z.string().min(1, 'Topic is required'),
  payload: z.string().optional().default(''),
});

export const WaitNodeDataSchema = z.object({
  duration: z.number().int().positive('Duration must be a positive integer'),
  unit: z.enum(['seconds', 'minutes', 'hours'], {
    errorMap: () => ({ message: 'Unit must be seconds, minutes, or hours' }),
  }),
});

export const IfNodeDataSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  comparisonOperator: z.enum(['=', '!=', '>', '<', '>=', '<='], {
    errorMap: () => ({ message: 'Comparison operator must be one of: =, !=, >, <, >=, <=' }),
  }),
  comparisonValueIsPath: z.boolean().default(false),
  comparisonValue: z.string().min(1, 'Comparison value is required'),
});

// Helper function to get the appropriate schema for a node type
export function getNodeDataSchema(nodeType: ResourceFlowNodeType | string) {
  switch (nodeType) {
    case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED:
    case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED:
    case ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER:
    case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLOCKED:
    case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_LOCKED:
    case ResourceFlowNodeType.INPUT_RESOURCE_DOOR_UNLATCHED:
      return EventNodeDataSchema;
    case ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST:
      return HttpRequestNodeDataSchema;
    case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
      return MqttSendMessageNodeDataSchema;
    case ResourceFlowNodeType.PROCESSING_WAIT:
      return WaitNodeDataSchema;
    case ResourceFlowNodeType.PROCESSING_IF:
      return IfNodeDataSchema;
    default:
      throw new Error(`Unknown node type: ${nodeType}`);
  }
}

// Type definitions for node data
export type ResourceFlowEventNodeData = z.infer<typeof EventNodeDataSchema>;
export type ResourceFlowActionHttpSendRequestNodeData = z.infer<typeof HttpRequestNodeDataSchema>;
export type ResourceFlowActionMqttSendMessageNodeData = z.infer<typeof MqttSendMessageNodeDataSchema>;
export type ResourceFlowActionUtilWaitNodeData = z.infer<typeof WaitNodeDataSchema>;
export type ResourceFlowActionIfNodeData = z.infer<typeof IfNodeDataSchema>;

export type ResourceFlowNodeData =
  | ResourceFlowEventNodeData
  | ResourceFlowActionHttpSendRequestNodeData
  | ResourceFlowActionMqttSendMessageNodeData
  | ResourceFlowActionUtilWaitNodeData
  | ResourceFlowActionIfNodeData;

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
    type: 'simple-enum',
    enum: ResourceFlowNodeType,
  })
  @ApiProperty({
    description: 'The type of the node',
    example: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
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
