import { ApiProperty } from '@nestjs/swagger';
import { BillingTransaction } from './billing-transaction.dto';

import { FormSubmission } from './form.dto';

import { Project } from './project.dto';

import { Resource } from './resource.dto';

import { ResourceUsageAction } from '@attraccess/application-models';

import { User } from './user.dto';
import type { ResponseFields } from '../response-mapper';

export class ResourceUsage {
  @ApiProperty({
    description: 'Snapshot of the session-duration rate when this usage session started',
    required: false,
    nullable: true,
  })
  sessionDurationCreditsPerMinute!: number | null;

  @ApiProperty({
    description: 'Snapshot of the attributable-operating-duration rate when this usage session started',
    required: false,
    nullable: true,
  })
  operatingDurationCreditsPerMinute!: number | null;

  @ApiProperty({
    description: 'Fixed usage fee snapshotted at session start; null for legacy sessions',
    nullable: true,
    required: false,
  })
  creditsPerUsage!: number | null;

  @ApiProperty({
    description: 'User billing percentage snapshotted at session start; null for legacy sessions',
    nullable: true,
    required: false,
  })
  billingFactor!: number | null;

  @ApiProperty({
    type: [Object],
    nullable: true,
    required: false,
  })
  meterRates!: { meterId: number; name: string; creditsPerUnit: number }[] | null;

  @ApiProperty({
    description: 'Operating duration attributed to this usage session in minutes',
    required: false,
    nullable: true,
  })
  attributedOperatingDurationInMinutes!: number | null;

  @ApiProperty({
    description: 'The unique identifier of the resource usage',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The type of usage',
    example: ResourceUsageAction.Usage,
    enum: ResourceUsageAction,
    enumName: 'ResourceUsageAction',
  })
  usageAction!: ResourceUsageAction;

  @ApiProperty({
    description: 'The ID of the resource being used',
    example: 1,
  })
  resourceId!: number;

  @ApiProperty({
    description: 'The ID of the user using the resource (null if user was deleted)',
    example: 1,
    required: false,
  })
  userId!: number | null;

  @ApiProperty({
    description: 'When the usage session started',
  })
  startTime!: Date;

  @ApiProperty({
    description: 'Notes provided when starting the session',
    example: 'Starting prototype development for client XYZ',
    required: false,
  })
  startNotes!: string | null;

  @ApiProperty({
    description: 'When the usage session ended',
    required: false,
  })
  endTime!: Date | null;

  @ApiProperty({
    description: 'Notes provided when ending the session',
    example: 'Completed initial prototype, material usage: 500g',
    required: false,
  })
  endNotes!: string | null;

  @ApiProperty({
    description: 'The resource being used',
    type: () => Resource,
    required: false,
  })
  resource!: Resource;

  @ApiProperty({
    description: 'The user who used the resource',
    required: false,
    type: () => User,
  })
  user!: User | null;

  @ApiProperty({
    description: 'The duration of the usage session in minutes',
    example: 120,
  })
  usageInMinutes!: number;

  billingTransaction!: BillingTransaction | null;

  @ApiProperty({
    description: 'The ID of the project this usage session belongs to',
    example: 1,
    required: false,
  })
  projectId!: number | null;

  @ApiProperty({
    description: 'The project this usage session belongs to',
    required: false,
    type: () => Project,
  })
  project!: Project | null;

  @ApiProperty({
    description: 'The form submissions that belong to this resource usage',
    type: () => FormSubmission,
    isArray: true,
  })
  formSubmissions!: FormSubmission[];

  @ApiProperty({ description: 'Whether the resource usage is finalized' })
  isFinalized!: boolean;

  /** Internal lifecycle reservation; excluded from public usage and duration calculations. */ lifecyclePending!: boolean;

  @ApiProperty({
    description: 'The ID of the supervisor who supervised this session (null if unsupervised or supervisor deleted)',
    example: 1,
    required: false,
    nullable: true,
  })
  supervisorUserId!: number | null;

  @ApiProperty({
    description: 'The supervisor who supervised this session',
    required: false,
    type: () => User,
  })
  supervisorUser!: User | null;
  static readonly responseFields: ResponseFields = {
    sessionDurationCreditsPerMinute: null,
    operatingDurationCreditsPerMinute: null,
    creditsPerUsage: null,
    billingFactor: null,
    meterRates: null,
    attributedOperatingDurationInMinutes: null,
    id: null,
    usageAction: null,
    resourceId: null,
    userId: null,
    startTime: null,
    startNotes: null,
    endTime: null,
    endNotes: null,
    resource: () => Resource,
    user: () => User,
    usageInMinutes: null,
    billingTransaction: () => BillingTransaction,
    projectId: null,
    project: () => Project,
    formSubmissions: () => FormSubmission,
    isFinalized: null,
    lifecyclePending: null,
    supervisorUserId: null,
    supervisorUser: () => User,
  };
}
