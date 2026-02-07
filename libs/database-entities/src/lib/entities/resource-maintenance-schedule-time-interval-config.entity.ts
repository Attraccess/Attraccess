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
 * Config for TIME_INTERVAL trigger. Exactly one mode must be used:
 * - Recurring: set intervalDays (e.g. every 30 days). Baseline = when last maintenance for this schedule was done.
 * - Wall-clock threshold: set thresholdHours. Baseline = when last maintenance for this schedule was done.
 */
@Entity()
export class ResourceMaintenanceScheduleTimeIntervalConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Unique identifier', example: 1 })
  id!: number;

  @Column({ type: 'int', unique: true })
  @ApiProperty({ description: 'Schedule this config belongs to', example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceMaintenanceSchedule, (schedule) => schedule.timeIntervalConfig, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceMaintenanceSchedule;

  /** Recurring mode: trigger every N days. Set this OR thresholdHours. */
  @Column({ type: 'int', nullable: true })
  @ApiProperty({
    description: 'Recurring: trigger every N days (e.g. 30 for monthly)',
    required: false,
    example: 30,
  })
  intervalDays!: number | null;

  /** Wall-clock threshold mode: trigger after N hours since last maintenance done for this schedule. */
  @Column({ type: 'real', nullable: true })
  @ApiProperty({
    description: 'Wall-clock: trigger after this many hours since last maintenance done for this schedule',
    required: false,
    example: 500,
  })
  thresholdHours!: number | null;
}
