// Config for INACTIVITY trigger: duration + unit + scope
// FEATURE: User retraining requirement (ATT-106)
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroductionSchedule } from './resource-introduction-schedule.entity';
import { RetrainingIntervalUnit } from '../types/retraining-interval-unit.enum';

export enum ResourceIntroductionScheduleInactivityScope {
  GROUP = 'GROUP',
  RESOURCE = 'RESOURCE',
}

@Entity()
export class ResourceIntroductionScheduleInactivityConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceIntroductionSchedule, (s) => s.inactivityConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceIntroductionSchedule;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 6 })
  duration!: number;

  @Column({ type: 'simple-enum', enum: RetrainingIntervalUnit })
  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  unit!: RetrainingIntervalUnit;

  @Column({ type: 'simple-enum', enum: ResourceIntroductionScheduleInactivityScope })
  @ApiProperty({ enum: ResourceIntroductionScheduleInactivityScope, enumName: 'ResourceIntroductionScheduleInactivityScope' })
  scope!: ResourceIntroductionScheduleInactivityScope;
}
