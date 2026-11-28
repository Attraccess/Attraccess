import { ApiProperty } from '@nestjs/swagger';
import {
  AutoIntroductionTarget,
  DocumentationType,
  ResourceType,
  SupervisionMode,
  type ResourceRecord,
} from '@attraccess/application-models';
import { FormResponseDto, ResourceFormDto } from '../forms/dto/form-response.dto';
import { ResourceGroup, toResourceGroupDto } from '../groups/dto/resource-group.dto';
import { toIntroductionDto, type ResourceIntroduction } from '../introductions/dtos/introduction-records.dto';
import { toUsageSessionResponse, type UsageSessionResponse } from '../usage/dtos/usage-session-response';

/*
 * Response shape of the resource endpoints. The class name is the OpenAPI schema name the generated client and the
 * frontend already use, so it stays what the former entity response was called.
 */
export class Resource {
  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    example: false,
    default: false,
  })
  allowTakeOver!: boolean;

  @ApiProperty({
    description:
      'Maximum number of people who can have an active session on this machine at the same time (machines only, 1-1000)',
    example: 1,
    default: 1,
    minimum: 1,
    maximum: 1000,
  })
  maxParallelSessions!: number;

  @ApiProperty({
    description: 'Longest a session on this machine may run, in minutes (1-43200). Null means no limit. Machines only.',
    example: 480,
    nullable: true,
    type: Number,
  })
  maxSessionDurationMinutes!: number | null;

  @ApiProperty({
    description: 'Whether starting a session requires an estimate of how long the machine will be used',
    example: false,
  })
  requireSessionDurationEstimate!: boolean;

  @ApiProperty({
    description:
      'The estimate for starts from readers that cannot ask for one, when an estimate is required and there is no maximum. Null means 60 minutes.',
    example: 60,
    nullable: true,
    type: Number,
  })
  defaultSessionDurationEstimateMinutes!: number | null;

  @ApiProperty({
    description:
      'Days after a user was trained on this resource before retraining is required. Null disables the age-based trigger.',
    example: 365,
    required: false,
    nullable: true,
  })
  retrainingMaxAgeDays!: number | null;

  @ApiProperty({
    description:
      'Days a user may go without using this resource before retraining is required. Null disables the inactivity trigger.',
    example: 180,
    required: false,
    nullable: true,
  })
  retrainingMaxInactivityDays!: number | null;

  @ApiProperty({
    description: 'Whether to block resource access once retraining is due until the user is retrained',
    example: false,
    default: false,
  })
  retrainingBlocksAccess!: boolean;

  @ApiProperty({
    description: 'Controls who may start a usage session on this resource',
    enum: SupervisionMode,
    enumName: 'SupervisionMode',
    example: SupervisionMode.INTRODUCTION_REQUIRED,
    default: SupervisionMode.INTRODUCTION_REQUIRED,
  })
  supervisionMode!: SupervisionMode;

  @ApiProperty({
    description:
      'Automatically create an introduction after this many supervised sessions. Null disables auto-promotion.',
    example: 3,
    required: false,
    nullable: true,
  })
  supervisedUsagesUntilIntroduction!: number | null;

  @ApiProperty({
    description: 'Target of the auto-created introduction once the supervised-usage threshold is reached',
    enum: AutoIntroductionTarget,
    enumName: 'AutoIntroductionTarget',
    example: AutoIntroductionTarget.RESOURCE,
    required: false,
    nullable: true,
  })
  autoIntroductionTarget!: AutoIntroductionTarget | null;

  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    example: 1,
    required: false,
    nullable: true,
  })
  autoIntroductionGroupId!: number | null;

  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    required: false,
    nullable: true,
    type: () => ResourceGroup,
  })
  autoIntroductionGroup?: ResourceGroup | null;

  @ApiProperty({ description: 'The unique identifier of the resource', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The name of the resource', example: '3D Printer' })
  name!: string;

  @ApiProperty({
    description: 'The type of the resource',
    example: ResourceType.Machine,
    enum: ResourceType,
    enumName: 'ResourceType',
  })
  type!: ResourceType;

  @ApiProperty({
    description: '(only for doors) wheter the door needs seperate actions for unlocking and unlatching',
    example: false,
    default: false,
  })
  separateUnlockAndUnlatch!: boolean | null;

  @ApiProperty({
    description:
      '(only for doors) whether the door is access only: its only action is Open (stored as a door unlock); lock and unlatch are refused',
    example: false,
    default: false,
  })
  accessOnly!: boolean;

  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description: 'The filename of the resource image',
    example: '1234567890_abcdef.jpg',
    required: false,
  })
  imageFilename!: string | null;

  @ApiProperty({
    description: 'The type of documentation (markdown or url)',
    enum: DocumentationType,
    required: false,
    example: DocumentationType.MARKDOWN,
    enumName: 'DocumentationType',
  })
  documentationType!: DocumentationType | null;

  @ApiProperty({
    description: 'Markdown content for resource documentation',
    required: false,
    example: '# Resource Documentation\n\nThis is a markdown documentation for the resource.',
  })
  documentationMarkdown!: string | null;

  @ApiProperty({
    description: 'URL to external documentation',
    required: false,
    example: 'https://example.com/documentation',
  })
  documentationUrl!: string | null;

  @ApiProperty({
    description: 'Custom metadata key-value pairs configured for this resource',
    required: false,
    type: Object,
    example: { location: 'lab-1', template: 'door-access' },
    additionalProperties: true,
  })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ description: 'When the resource was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the resource was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'When the resource was deleted', nullable: true })
  deletedAt!: Date | null;

  @ApiProperty({ description: 'The groups the resource belongs to', type: ResourceGroup, isArray: true })
  groups?: ResourceGroup[];

  @ApiProperty({ description: 'The forms attached to the resource', type: () => ResourceFormDto, isArray: true })
  forms?: FormResponseDto[];

  /** Embedded by the resource detail and in-use reads; not part of the documented schema. */
  usages?: UsageSessionResponse[];

  /** Embedded by the resource detail read for people who may see the access lists; not documented. */
  introductions?: ResourceIntroduction[];
}

/** Copies the response fields of a resource; the relations a read did not load stay out. */
export function toResourceDto(record: ResourceRecord): Resource {
  const dto: Resource = {
    allowTakeOver: record.allowTakeOver,
    maxParallelSessions: record.maxParallelSessions,
    maxSessionDurationMinutes: record.maxSessionDurationMinutes,
    requireSessionDurationEstimate: record.requireSessionDurationEstimate,
    defaultSessionDurationEstimateMinutes: record.defaultSessionDurationEstimateMinutes,
    retrainingMaxAgeDays: record.retrainingMaxAgeDays,
    retrainingMaxInactivityDays: record.retrainingMaxInactivityDays,
    retrainingBlocksAccess: record.retrainingBlocksAccess,
    supervisionMode: record.supervisionMode,
    supervisedUsagesUntilIntroduction: record.supervisedUsagesUntilIntroduction,
    autoIntroductionTarget: record.autoIntroductionTarget,
    autoIntroductionGroupId: record.autoIntroductionGroupId,
    id: record.id,
    name: record.name,
    type: record.type,
    separateUnlockAndUnlatch: record.separateUnlockAndUnlatch,
    accessOnly: record.accessOnly,
    description: record.description,
    imageFilename: record.imageFilename,
    documentationType: record.documentationType,
    documentationMarkdown: record.documentationMarkdown,
    documentationUrl: record.documentationUrl,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
  if (record.groups !== undefined) dto.groups = record.groups.map(toResourceGroupDto);
  if (record.usages !== undefined) dto.usages = record.usages.map(toUsageSessionResponse);
  if (record.introductions !== undefined) dto.introductions = record.introductions.map(toIntroductionDto);
  return dto;
}
