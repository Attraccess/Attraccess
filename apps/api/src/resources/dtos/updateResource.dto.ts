import {
  AutoIntroductionTarget,
  DocumentationType,
  ResourceType,
  SupervisionMode,
} from '@attraccess/application-models';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min, ValidateIf, IsUrl } from 'class-validator';
import { ToBoolean, ToJson, ToNumber } from '../../common/request-transformers';
import { FileUpload } from '../../common/types/file-upload.types';

export class UpdateResourceDtoDocumentation {
  @ApiProperty({
    description: 'New resource image file',
    required: false,
    type: 'string',
    format: 'binary',
  })
  image?: FileUpload;

  @ApiProperty({
    description: 'Whether the resource image should be deleted',
    required: false,
    type: Boolean,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  deleteImage?: boolean;

  @ApiProperty({
    description: 'The type of documentation (markdown or url)',
    enum: DocumentationType,
    required: false,
    example: DocumentationType.MARKDOWN,
    enumName: 'DocumentationType',
  })
  @IsEnum(DocumentationType)
  @IsOptional()
  documentationType?: DocumentationType;

  @ApiProperty({
    description: 'Markdown content for resource documentation',
    required: false,
    example: '# Resource Documentation\n\nThis is a markdown documentation for the resource.',
  })
  @IsString()
  @ValidateIf((o) => o.documentationType === DocumentationType.MARKDOWN)
  @IsOptional()
  documentationMarkdown?: string;

  @ApiProperty({
    description: 'URL to external documentation',
    required: false,
    example: 'https://example.com/documentation',
  })
  @IsUrl()
  @ValidateIf((o) => o.documentationType === DocumentationType.URL)
  @IsOptional()
  documentationUrl?: string;
}

export class UpdateResourceDto extends UpdateResourceDtoDocumentation {
  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'The type of the resource',
    example: ResourceType.Machine,
    enum: ResourceType,
    required: false,
    enumName: 'ResourceType',
  })
  @IsEnum(ResourceType)
  @IsOptional()
  type: ResourceType;

  @ApiProperty({
    description: '(only for doors) wheter the door needs seperate actions for unlocking and unlatching',
    example: false,
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  separateUnlockAndUnlatch?: boolean;

  @ApiProperty({
    description:
      '(only for doors) whether the door is access only: its only action is Open (stored as a door unlock). Cannot be combined with separateUnlockAndUnlatch',
    example: false,
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  accessOnly?: boolean;

  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
  @ApiProperty({
    description: 'Custom metadata key-value pairs configured for this resource',
    required: false,
    type: Object,
    example: {
      location: 'lab-1',
      template: 'door-access',
    },
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  @ToJson()
  metadata?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  allowTakeOver?: boolean;

  @ApiProperty({
    description:
      'Whether ending your own session first asks "Is the machine OK?" (web and Attractap readers). Needs the maintenance license module. Not enforced by the API.',
    required: false,
    example: true,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  askMaintenanceCheckOnSessionEnd?: boolean;

  @ApiProperty({
    description: 'Maximum number of people who can use this machine at the same time (machines only)',
    required: false,
    example: 1,
    default: 1,
    minimum: 1,
    maximum: 1000,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.maxParallelSessions !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxParallelSessions?: number;

  @ApiProperty({
    description:
      'Longest a session on this machine may run, in minutes (1-43200). The server ends a session that reaches it. Null or omitted means no limit. Machines only: doors ignore it. Applies to sessions started afterwards.',
    required: false,
    nullable: true,
    example: 480,
    minimum: 1,
    maximum: 43200,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.maxSessionDurationMinutes !== null && o.maxSessionDurationMinutes !== undefined)
  @IsInt()
  @Min(1)
  @Max(43200)
  @IsOptional()
  maxSessionDurationMinutes?: number | null;

  @ApiProperty({
    description:
      'Whether starting a session requires an estimate of how long the machine will be used. The machine stops automatically when that time is up. Machines only: doors ignore it.',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  requireSessionDurationEstimate?: boolean;

  @ApiProperty({
    description:
      'The estimate used for a start from a reader that cannot ask for one, when an estimate is required and there is no maximum (1-43200, at most the maximum). Null means 60 minutes.',
    required: false,
    nullable: true,
    example: 60,
    minimum: 1,
    maximum: 43200,
    type: Number,
  })
  @ToNumber()
  @ValidateIf(
    (o) => o.defaultSessionDurationEstimateMinutes !== null && o.defaultSessionDurationEstimateMinutes !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(43200)
  @IsOptional()
  defaultSessionDurationEstimateMinutes?: number | null;

  @ApiProperty({
    description: 'Days after a user was trained before retraining is required. Null disables the age-based trigger.',
    required: false,
    nullable: true,
    example: 365,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.retrainingMaxAgeDays !== null && o.retrainingMaxAgeDays !== undefined)
  @IsInt()
  @Min(0)
  @IsOptional()
  retrainingMaxAgeDays?: number | null;

  @ApiProperty({
    description:
      'Days a user may go without using this resource before retraining is required. Null disables the inactivity trigger.',
    required: false,
    nullable: true,
    example: 180,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.retrainingMaxInactivityDays !== null && o.retrainingMaxInactivityDays !== undefined)
  @IsInt()
  @Min(0)
  @IsOptional()
  retrainingMaxInactivityDays?: number | null;

  @ApiProperty({
    description: 'Whether to block resource access once retraining is due until the user is retrained',
    required: false,
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  retrainingBlocksAccess?: boolean;

  @ApiProperty({
    description: 'Controls who may start a usage session on this resource',
    required: false,
    enum: SupervisionMode,
    enumName: 'SupervisionMode',
    example: SupervisionMode.INTRODUCTION_REQUIRED,
  })
  @IsEnum(SupervisionMode)
  @IsOptional()
  supervisionMode?: SupervisionMode;

  @ApiProperty({
    description:
      'Automatically create an introduction after this many supervised sessions. Null disables auto-promotion.',
    required: false,
    nullable: true,
    example: 3,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.supervisedUsagesUntilIntroduction !== null && o.supervisedUsagesUntilIntroduction !== undefined)
  @IsInt()
  @Min(1)
  @IsOptional()
  supervisedUsagesUntilIntroduction?: number | null;

  @ApiProperty({
    description: 'Target of the auto-created introduction once the supervised-usage threshold is reached',
    required: false,
    nullable: true,
    enum: AutoIntroductionTarget,
    enumName: 'AutoIntroductionTarget',
    example: AutoIntroductionTarget.RESOURCE,
  })
  @IsEnum(AutoIntroductionTarget)
  @IsOptional()
  autoIntroductionTarget?: AutoIntroductionTarget | null;

  @ApiProperty({
    description: 'The group the auto-introduction targets when autoIntroductionTarget is GROUP',
    required: false,
    nullable: true,
    example: 1,
    type: Number,
  })
  @ToNumber()
  @ValidateIf((o) => o.autoIntroductionGroupId !== null && o.autoIntroductionGroupId !== undefined)
  @IsInt()
  @Min(1)
  @IsOptional()
  autoIntroductionGroupId?: number | null;
}
