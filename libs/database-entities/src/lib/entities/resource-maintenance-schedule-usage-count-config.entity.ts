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
 * Config for USAGE_COUNT trigger. Baseline is always the end of the last maintenance
 * created by this schedule (when that maintenance was marked done).
 */
@Entity()
export class ResourceMaintenanceScheduleUsageCountConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @Column({ type: 'int', unique: true })
  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceMaintenanceSchedule, (schedule) => schedule.usageCountConfig, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceMaintenanceSchedule;

  @Column({ type: 'int' })
  @ApiProperty({ description: 'Trigger after this many usage sessions (since last maintenance done for this schedule)', example: 50 })
  thresholdSessions!: number;
}
