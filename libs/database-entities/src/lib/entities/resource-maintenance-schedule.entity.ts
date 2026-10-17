import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { ResourceMaintenanceScheduleUsageHoursConfig } from './resource-maintenance-schedule-usage-hours-config.entity';
import { ResourceMaintenanceScheduleUsageCountConfig } from './resource-maintenance-schedule-usage-count-config.entity';
import { ResourceMaintenanceScheduleTimeIntervalConfig } from './resource-maintenance-schedule-time-interval-config.entity';
import {
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleDurationBasis,
} from '@attraccess/application-models';

@Entity()
export class ResourceMaintenanceSchedule {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the maintenance schedule',
    example: 1,
  })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the schedule was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the schedule was last updated',
  })
  updatedAt!: Date;

  @Column({ type: 'int' })
  @ApiProperty({
    description: 'The ID of the resource',
    example: 1,
  })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.maintenanceSchedules)
  resource!: Resource;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional human-readable label for the schedule',
    required: false,
  })
  name!: string | null;

  @Column({ type: 'simple-enum', enum: ResourceMaintenanceScheduleTriggerType })
  @ApiProperty({
    description: 'The type of trigger for this schedule',
    enum: ResourceMaintenanceScheduleTriggerType,
    enumName: 'ResourceMaintenanceScheduleTriggerType',
  })
  triggerType!: ResourceMaintenanceScheduleTriggerType;

  @Column({
    type: 'simple-enum',
    enum: ResourceMaintenanceScheduleDurationBasis,
    default: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
  })
  @ApiProperty({
    description: 'The duration source used for USAGE_HOURS schedules',
    enum: ResourceMaintenanceScheduleDurationBasis,
    enumName: 'ResourceMaintenanceScheduleDurationBasis',
    default: ResourceMaintenanceScheduleDurationBasis.SESSION_DURATION,
  })
  durationBasis!: ResourceMaintenanceScheduleDurationBasis;

  @OneToOne(() => ResourceMaintenanceScheduleUsageHoursConfig, (config) => config.schedule, { nullable: true })
  @ApiProperty({ description: 'Config when triggerType is USAGE_HOURS', required: false })
  usageHoursConfig?: ResourceMaintenanceScheduleUsageHoursConfig | null;

  @OneToOne(() => ResourceMaintenanceScheduleUsageCountConfig, (config) => config.schedule, { nullable: true })
  @ApiProperty({ description: 'Config when triggerType is USAGE_COUNT', required: false })
  usageCountConfig?: ResourceMaintenanceScheduleUsageCountConfig | null;

  @OneToOne(() => ResourceMaintenanceScheduleTimeIntervalConfig, (config) => config.schedule, { nullable: true })
  @ApiProperty({ description: 'Config when triggerType is TIME_INTERVAL', required: false })
  timeIntervalConfig?: ResourceMaintenanceScheduleTimeIntervalConfig | null;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description: 'Whether the schedule is enabled',
    example: true,
    default: true,
  })
  enabled!: boolean;
}

export {
  ResourceMaintenanceScheduleTriggerType,
  ResourceMaintenanceScheduleDurationBasis,
} from '@attraccess/application-models';
