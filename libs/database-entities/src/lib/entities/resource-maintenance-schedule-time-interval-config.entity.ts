import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceMaintenanceSchedule } from './resource-maintenance-schedule.entity';
import { UsageDurationUnit } from '../types/usageDurationUnit.enum';

/**
 * Config for TIME_INTERVAL trigger. Uses duration + unit (same as USAGE_HOURS).
 * Trigger after N duration (in unit) has passed since baseline (wall-clock).
 * Baseline = when last maintenance for this schedule was done.
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

  @Column({ type: 'int' })
  @ApiProperty({
    description: 'Duration value (combined with unit)',
    example: 30,
  })
  duration!: number;

  @Column({ type: 'simple-enum', enum: UsageDurationUnit })
  @ApiProperty({
    description: 'Unit for duration (MINUTES, HOURS, or DAYS)',
    enum: UsageDurationUnit,
    enumName: 'UsageDurationUnit',
  })
  unit!: UsageDurationUnit;
}
