import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.entity';

/**
 * Config for USAGE_HOURS trigger. Baseline is always the end of the last maintenance
 * created by this schedule (when that maintenance was marked done).
 */
@Entity()
export class ResourceMaintenanceScheduleUsageHoursConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @Column({ type: 'int', unique: true })
  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceMaintenanceSchedule, (schedule) => schedule.usageHoursConfig, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceMaintenanceSchedule;

  @Column({ type: 'int' })
  @ApiProperty({ description: 'Trigger after this many minutes of resource usage (since last maintenance done for this schedule)', example: 6000 })
  thresholdMinutes!: number;
}
