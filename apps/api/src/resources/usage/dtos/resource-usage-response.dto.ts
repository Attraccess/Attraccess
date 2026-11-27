import { ProjectSwitchCharging, ResourceUsageAction } from '@attraccess/application-models';
import { ApiProperty, ApiSchema, getSchemaPath } from '@nestjs/swagger';

/**
 * The usage session as the API describes it. The schema keeps the name `ResourceUsage` the published API
 * description (and the generated clients) use. The related user, resource, project and form submissions refer to
 * the schemas of their own endpoints by name.
 */
@ApiSchema({ name: 'ResourceUsage' })
export class ResourceUsageResponseDto {
  @ApiProperty({
    description: 'Snapshot of the session-duration rate when this usage session started',
    required: false,
    nullable: true,
    type: Number,
  })
  sessionDurationCreditsPerMinute!: number | null;

  @ApiProperty({
    description: 'Snapshot of the attributable-operating-duration rate when this usage session started',
    required: false,
    nullable: true,
    type: Number,
  })
  operatingDurationCreditsPerMinute!: number | null;

  @ApiProperty({
    description: 'Fixed usage fee snapshotted at session start; null for legacy sessions',
    nullable: true,
    required: false,
    type: Number,
  })
  creditsPerUsage!: number | null;

  @ApiProperty({
    description: 'User billing percentage snapshotted at session start; null for legacy sessions',
    nullable: true,
    required: false,
    type: Number,
  })
  billingFactor!: number | null;

  @ApiProperty({ type: [Object], nullable: true, required: false })
  meterRates!:
    { meterId: number; name: string; creditsPerUnit: number; allocation?: 'shared' | 'per-session' }[] | null;

  @ApiProperty({
    description: 'Operating duration attributed to this usage session in minutes',
    required: false,
    nullable: true,
    type: Number,
  })
  attributedOperatingDurationInMinutes!: number | null;

  @ApiProperty({
    description:
      'When the server ends this session automatically (fixed at the start, only raised by extensions). Null means it never ends automatically.',
    required: false,
    nullable: true,
    type: Date,
  })
  autoEndAt!: Date | null;

  @ApiProperty({
    description:
      'The latest the automatic end can be extended to (start plus the maximum session time the machine had then). Null when the machine had no maximum; the 30 day limit applies then.',
    required: false,
    nullable: true,
    type: Date,
  })
  maxAutoEndAt!: Date | null;

  @ApiProperty({
    description: 'The duration estimate the user gave when starting, in minutes',
    required: false,
    nullable: true,
    type: Number,
  })
  estimatedDurationMinutes!: number | null;

  @ApiProperty({ description: 'The unique identifier of the resource usage', example: 1 })
  id!: number;

  @ApiProperty({
    description: 'The type of usage',
    example: ResourceUsageAction.Usage,
    enum: ResourceUsageAction,
    enumName: 'ResourceUsageAction',
  })
  usageAction!: ResourceUsageAction;

  @ApiProperty({ description: 'The ID of the resource being used', example: 1 })
  resourceId!: number;

  @ApiProperty({
    description: 'The ID of the user using the resource (null if user was deleted)',
    example: 1,
    required: false,
    type: Number,
  })
  userId!: number | null;

  @ApiProperty({ description: 'When the usage session started', type: Date })
  startTime!: Date;

  @ApiProperty({
    description: 'Notes provided when starting the session',
    example: 'Starting prototype development for client XYZ',
    required: false,
    type: String,
  })
  startNotes!: string | null;

  @ApiProperty({ description: 'When the usage session ended', required: false, type: Date })
  endTime!: Date | null;

  @ApiProperty({
    description: 'Notes provided when ending the session',
    example: 'Completed initial prototype, material usage: 500g',
    required: false,
    type: String,
  })
  endNotes!: string | null;

  @ApiProperty({
    description: 'The resource being used',
    required: false,
    allOf: [{ $ref: getSchemaPath('Resource') }],
  })
  resource!: unknown;

  @ApiProperty({
    description: 'The user who used the resource',
    required: false,
    allOf: [{ $ref: getSchemaPath('User') }],
  })
  user!: unknown;

  @ApiProperty({ description: 'The duration of the usage session in minutes', example: 120 })
  usageInMinutes!: number;

  @ApiProperty({
    description: 'The ID of the project this usage session belongs to',
    example: 1,
    required: false,
    type: Number,
  })
  projectId!: number | null;

  @ApiProperty({
    description:
      'Set when this record continues a session after a project switch: the id of the part before it. A session whose project was switched is several consecutive records, one per project.',
    example: 1203,
    required: false,
    nullable: true,
    type: Number,
  })
  previousUsageId!: number | null;

  @ApiProperty({
    description:
      'The charging mode in effect at the project switch that created this record; null for every other record',
    required: false,
    nullable: true,
    enum: ProjectSwitchCharging,
    enumName: 'ProjectSwitchCharging',
  })
  projectSwitchCharging!: ProjectSwitchCharging | null;

  @ApiProperty({
    description:
      'On a record that continues a session after a project switch: when that session started. `startTime` is when this record started. Null otherwise.',
    required: false,
    nullable: true,
    type: Date,
  })
  sessionStartTime!: Date | null;

  @ApiProperty({
    description: 'The project this usage session belongs to',
    required: false,
    allOf: [{ $ref: getSchemaPath('Project') }],
  })
  project!: unknown;

  @ApiProperty({
    description: 'The form submissions that belong to this resource usage',
    type: 'array',
    items: { $ref: getSchemaPath('FormSubmission') },
  })
  formSubmissions!: unknown[];

  @ApiProperty({ description: 'Whether the resource usage is finalized' })
  isFinalized!: boolean;

  @ApiProperty({
    description: 'The ID of the supervisor who supervised this session (null if unsupervised or supervisor deleted)',
    example: 1,
    required: false,
    nullable: true,
    type: Number,
  })
  supervisorUserId!: number | null;

  @ApiProperty({
    description: 'The supervisor who supervised this session',
    required: false,
    allOf: [{ $ref: getSchemaPath('User') }],
  })
  supervisorUser!: unknown;
}
