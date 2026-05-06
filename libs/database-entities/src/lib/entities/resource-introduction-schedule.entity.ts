// Schedule entity that defines when an introduction must be renewed
// FEATURE: User retraining requirement (ATT-106)
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { ResourceGroup } from './resourceGroup.entity';
import { ResourceIntroductionScheduleTimeSinceIntroductionConfig } from './resource-introduction-schedule-time-since-introduction-config.entity';
import { ResourceIntroductionScheduleInactivityConfig } from './resource-introduction-schedule-inactivity-config.entity';

export enum ResourceIntroductionScheduleTriggerType {
  TIME_SINCE_INTRODUCTION = 'TIME_SINCE_INTRODUCTION',
  INACTIVITY = 'INACTIVITY',
}

@Entity()
export class ResourceIntroductionSchedule {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Schedule ID', example: 1 })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'Created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'Updated' })
  updatedAt!: Date;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Resource ID (set when scope=resource)', required: false })
  resourceId!: number | null;

  @ManyToOne(() => Resource, (r) => r.introductionSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource?: Resource | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Resource group ID (set when scope=group)', required: false })
  resourceGroupId!: number | null;

  @ManyToOne(() => ResourceGroup, (g) => g.introductionSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceGroupId' })
  resourceGroup?: ResourceGroup | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'Optional human-readable label', required: false })
  name!: string | null;

  @Column({ type: 'simple-enum', enum: ResourceIntroductionScheduleTriggerType })
  @ApiProperty({ enum: ResourceIntroductionScheduleTriggerType, enumName: 'ResourceIntroductionScheduleTriggerType' })
  triggerType!: ResourceIntroductionScheduleTriggerType;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether triggering this schedule blocks usage', default: false })
  blockAccess!: boolean;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({ description: 'Days before due date to email a warning. 0 disables.', default: 0 })
  warnDaysBefore!: number;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({ description: 'Schedule enabled', default: true })
  enabled!: boolean;

  @OneToOne(
    () => ResourceIntroductionScheduleTimeSinceIntroductionConfig,
    (c) => c.schedule,
    { nullable: true }
  )
  @ApiProperty({ required: false })
  timeSinceIntroductionConfig?: ResourceIntroductionScheduleTimeSinceIntroductionConfig | null;

  @OneToOne(
    () => ResourceIntroductionScheduleInactivityConfig,
    (c) => c.schedule,
    { nullable: true }
  )
  @ApiProperty({ required: false })
  inactivityConfig?: ResourceIntroductionScheduleInactivityConfig | null;
}
