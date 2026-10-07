import { ApiProperty } from '@nestjs/swagger';
import { Column, JoinColumn, ManyToOne } from 'typeorm';
import { AutoIntroductionTarget, SupervisionMode } from './resource.supervision';
import { ResourceGroup } from './resourceGroup.entity';

/** Persisted resource access policy inherited by Resource. */
export abstract class ResourceAccessPolicy {
  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    example: false,
    default: false,
  })
  allowTakeOver!: boolean;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description:
      'Days after a user was trained on this resource before retraining is required. Null disables the age-based trigger.',
    example: 365,
    required: false,
    nullable: true,
  })
  retrainingMaxAgeDays!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description:
      'Days a user may go without using this resource before retraining is required. Null disables the inactivity trigger.',
    example: 180,
    required: false,
    nullable: true,
  })
  retrainingMaxInactivityDays!: number | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether to block resource access once retraining is due until the user is retrained',
    example: false,
    default: false,
  })
  retrainingBlocksAccess!: boolean;

  @Column({
    type: 'simple-enum',
    enum: SupervisionMode,
    default: SupervisionMode.INTRODUCTION_REQUIRED,
  })
  @ApiProperty({
    description: 'Controls who may start a usage session on this resource',
    enum: SupervisionMode,
    enumName: 'SupervisionMode',
    example: SupervisionMode.INTRODUCTION_REQUIRED,
    default: SupervisionMode.INTRODUCTION_REQUIRED,
  })
  supervisionMode!: SupervisionMode;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description:
      'Automatically create an introduction after this many supervised sessions. Null disables auto-promotion.',
    example: 3,
    required: false,
    nullable: true,
  })
  supervisedUsagesUntilIntroduction!: number | null;

  @Column({ type: 'simple-enum', enum: AutoIntroductionTarget, nullable: true })
  @ApiProperty({
    description: 'Target of the auto-created introduction once the supervised-usage threshold is reached',
    enum: AutoIntroductionTarget,
    enumName: 'AutoIntroductionTarget',
    example: AutoIntroductionTarget.RESOURCE,
    required: false,
    nullable: true,
  })
  autoIntroductionTarget!: AutoIntroductionTarget | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    example: 1,
    required: false,
    nullable: true,
  })
  autoIntroductionGroupId!: number | null;

  @ManyToOne(() => ResourceGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'autoIntroductionGroupId' })
  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    type: () => ResourceGroup,
    required: false,
    nullable: true,
  })
  autoIntroductionGroup!: ResourceGroup | null;
}
