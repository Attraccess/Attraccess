// Config for TIME_SINCE_INTRODUCTION trigger: duration + unit
// FEATURE: User retraining requirement (ATT-106)
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroductionSchedule } from './resource-introduction-schedule.entity';
import { RetrainingIntervalUnit } from '../types/retraining-interval-unit.enum';

@Entity()
export class ResourceIntroductionScheduleTimeSinceIntroductionConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceIntroductionSchedule, (s) => s.timeSinceIntroductionConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceIntroductionSchedule;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 1, description: 'Duration value' })
  duration!: number;

  @Column({ type: 'simple-enum', enum: RetrainingIntervalUnit })
  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  unit!: RetrainingIntervalUnit;
}
