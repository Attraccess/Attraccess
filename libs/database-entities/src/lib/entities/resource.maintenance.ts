import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.entity';

@Index('IDX_resource_maintenance_scheduleId_endTime', ['maintenanceSchedule', 'endTime'])
@Index('IDX_resource_maintenance_resourceId_endTime', ['resourceId', 'endTime'])
@Entity()
export class ResourceMaintenance {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the maintenance',
    example: 1,
  })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the maintenance was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the maintenance was last updated',
  })
  updatedAt!: Date;

  @Column({ type: 'int' })
  @ApiProperty({
    description: 'The ID of the resource',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.maintenances)
  resource!: Resource;

  @Column({ type: 'datetime' })
  @ApiProperty({
    description: 'When the maintenance started',
    type: String,
    example: '2025-01-01T00:00:00.000Z',
    format: 'date-time',
  })
  startTime!: Date;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When the maintenance ended (null if not ended yet)',
    required: false,
    type: String,
    example: '2025-01-01T00:00:00.000Z',
    nullable: true,
    format: 'date-time',
  })
  endTime!: Date | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The reason for the maintenance',
    required: false,
  })
  reason!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @ApiProperty({
    description: 'The user who created/started the maintenance record',
    required: false,
  })
  createdByUser!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @ApiProperty({
    description: 'The user who marked the maintenance as done',
    required: false,
  })
  completedByUser!: User | null;

  @Column({ type: 'datetime', nullable: true })
  @ApiProperty({
    description: 'When the maintenance was marked as done',
    required: false,
    type: String,
    nullable: true,
    format: 'date-time',
  })
  completedAt!: Date | null;

  @ManyToOne(() => ResourceMaintenanceSchedule, { nullable: true })
  @ApiProperty({
    description: 'The schedule that triggered this maintenance (null for manual)',
    required: false,
  })
  maintenanceSchedule!: ResourceMaintenanceSchedule | null;
}
