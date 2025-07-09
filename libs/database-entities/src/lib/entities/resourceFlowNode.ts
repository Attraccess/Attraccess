import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { Resource } from './resource.entity';

export enum ResourceFlowNodeType {
  EVENT_RESOURCE_USAGE_STARTED = 'event.resource.usage.started',
  EVENT_RESOURCE_USAGE_STOPPED = 'event.resource.usage.stopped',
  EVENT_RESOURCE_USAGE_TAKEOVER = 'event.resource.usage.takeover',
  ACTION_HTTP_SEND_REQUEST = 'action.http.sendRequest',
  ACTION_MQTT_SEND_MESSAGE = 'action.mqtt.sendMessage',
  ACTION_WAIT = 'action.util.wait',
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

// Helper function to get the appropriate schema for a node type
export function getNodeDataSchema(nodeType: ResourceFlowNodeType | string) {
  switch (nodeType) {
    case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED:
    case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STOPPED:
    case ResourceFlowNodeType.EVENT_RESOURCE_USAGE_TAKEOVER:
      return EventNodeDataSchema;
    case ResourceFlowNodeType.ACTION_HTTP_SEND_REQUEST:
      return HttpRequestNodeDataSchema;
    case ResourceFlowNodeType.ACTION_MQTT_SEND_MESSAGE:
      return MqttSendMessageNodeDataSchema;
    case ResourceFlowNodeType.ACTION_WAIT:
      return WaitNodeDataSchema;
    default:
      throw new Error(`Unknown node type: ${nodeType}`);
  }
}

// Type definitions for node data
export type ResourceFlowEventNodeData = z.infer<typeof EventNodeDataSchema>;
export type ResourceFlowActionHttpSendRequestNodeData = z.infer<typeof HttpRequestNodeDataSchema>;
export type ResourceFlowActionMqttSendMessageNodeData = z.infer<typeof MqttSendMessageNodeDataSchema>;
export type ResourceFlowActionUtilWaitNodeData = z.infer<typeof WaitNodeDataSchema>;

export type ResourceFlowNodeData =
  | ResourceFlowEventNodeData
  | ResourceFlowActionHttpSendRequestNodeData
  | ResourceFlowActionMqttSendMessageNodeData
  | ResourceFlowActionUtilWaitNodeData;

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
    example: ResourceFlowNodeType.EVENT_RESOURCE_USAGE_STARTED,
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
