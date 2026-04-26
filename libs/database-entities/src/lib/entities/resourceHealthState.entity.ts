import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';

export enum ResourceHealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
}

export enum ResourceHealthSource {
  PAYLOAD = 'payload',
  HEARTBEAT = 'heartbeat',
  MANUAL = 'manual',
}

@Entity()
@Unique('UQ_resource_health_resource_identifier', ['resourceId', 'identifier'])
@Index('IDX_resource_health_resource', ['resourceId'])
export class ResourceHealthState {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the health state record',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the resource this health state belongs to',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({
    description: 'The resource this health state belongs to',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;

  @Column({ type: 'text', default: '' })
  @ApiProperty({
    description: 'Identifier for the source reporting health (e.g. "Shelly", "internal-temp"). Empty string for the resource default.',
    example: 'Shelly',
  })
  identifier!: string;

  @Column({ type: 'simple-enum', enum: ResourceHealthStatus, default: ResourceHealthStatus.HEALTHY })
  @ApiProperty({
    description: 'Current health status',
    enum: ResourceHealthStatus,
    enumName: 'ResourceHealthStatus',
    example: ResourceHealthStatus.HEALTHY,
  })
  status!: ResourceHealthStatus;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Human-readable reason for the current status (e.g. "not connected"). Null when healthy.',
    required: false,
    nullable: true,
    example: 'not connected',
  })
  reason!: string | null;

  @Column({ type: 'simple-enum', enum: ResourceHealthSource, default: ResourceHealthSource.MANUAL })
  @ApiProperty({
    description: 'Detection variant that produced the current state',
    enum: ResourceHealthSource,
    enumName: 'ResourceHealthSource',
    example: ResourceHealthSource.PAYLOAD,
  })
  source!: ResourceHealthSource;

  @Column({ type: 'datetime' })
  @ApiProperty({
    description: 'When the health state was last reported (or when the heartbeat last fired)',
    type: String,
    format: 'date-time',
  })
  lastReportedAt!: Date;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the health state record was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the health state record was last updated',
  })
  updatedAt!: Date;
}
