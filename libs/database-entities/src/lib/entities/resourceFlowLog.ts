import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

export enum ResourceFlowLogType {
  FLOW_START = 'flow.start',
  NODE_PROCESSING_STARTED = 'node.processing.started',
  NODE_PROCESSING_FAILED = 'node.processing.failed',
  NODE_PROCESSING_COMPLETED = 'node.processing.completed',
  FLOW_COMPLETED = 'flow.completed',
}

@Entity()
export class ResourceFlowLog {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the resource flow log',
    example: 42,
  })
  id!: number;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The node id of the node that generated the log',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
    nullable: true,
  })
  nodeId!: string | null;

  @Column({ type: 'text', nullable: false })
  @ApiProperty({
    description: 'The run/execution id of the flow that generated the log',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true,
  })
  flowRunId!: string;

  @Column({
    type: 'varchar',
    enum: ResourceFlowLogType,
  })
  @ApiProperty({
    description: 'The type of the log entry',
    enum: ResourceFlowLogType,
    example: ResourceFlowLogType.NODE_PROCESSING_STARTED,
  })
  type!: ResourceFlowLogType;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional payload for additional user information',
    example: 'Processing took longer than expected due to network latency',
    required: false,
  })
  payload?: string;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the node was created',
  })
  createdAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The id of the resource that this log belongs to',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.flowLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource being this log belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;
}
