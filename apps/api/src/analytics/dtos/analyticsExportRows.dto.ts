import { BillingTransactionStatus, ResourceUsageAction } from '@attraccess/application-models';
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { BillingTransactionItemDto } from '../../billing/dto/billing-transaction.dto';
import { FormSubmissionSchemaDto } from './formSubmissionSchema.dto';

/*
 * The published response schemas of the export endpoints. They describe the stored session and transaction with
 * the export's flat email fields; the related user, resource, usage and items refer to the schemas of their own
 * endpoints by name. The persistence adapter maps its rows into these classes field by field.
 *
 * `User.email` is never part of a user object, so the export carries explicit, flat email fields. The nested users
 * are mapped to the public user shape and never carry email, tokens or lockout state.
 *
 * The billing endpoint is guarded by `resources.update`, which on its own does not grant access to emails, so its
 * email fields are only filled for callers that also hold one of BILLING_EXPORT_EMAIL_PERMISSIONS.
 */

export const BILLING_EXPORT_EMAIL_PERMISSIONS = ['billing.manage', 'resources.reports.export'] as const;

const ref = (schema: string) => ({ allOf: [{ $ref: getSchemaPath(schema) }] });

/** One usage session of the export. */
export class ResourceUsageExportRowDto {
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

  @ApiProperty({ description: 'The resource being used', required: false, ...ref('Resource') })
  resource?: object;

  @ApiProperty({ description: 'The user who used the resource', required: false, ...ref('User') })
  user?: object | null;

  @ApiProperty({ description: 'The duration of the usage session in minutes', example: 120 })
  usageInMinutes!: number;

  @ApiProperty({
    description: 'The ID of the project this usage session belongs to',
    example: 1,
    required: false,
    type: Number,
  })
  projectId!: number | null;

  @ApiProperty({ description: 'The project this usage session belongs to', required: false, ...ref('Project') })
  project?: object | null;

  @ApiProperty({
    description: 'The form submissions that belong to this resource usage',
    type: () => FormSubmissionSchemaDto,
    isArray: true,
  })
  formSubmissions?: object[];

  @ApiProperty({ description: 'Whether the resource usage is finalized' })
  isFinalized!: boolean;

  /** Internal lifecycle flag; not documented, kept in the response as before. */
  lifecyclePending!: boolean;

  @ApiProperty({
    description: 'The ID of the supervisor who supervised this session (null if unsupervised or supervisor deleted)',
    example: 1,
    required: false,
    nullable: true,
    type: Number,
  })
  supervisorUserId!: number | null;

  @ApiProperty({ description: 'The supervisor who supervised this session', required: false, ...ref('User') })
  supervisorUser?: object | null;

  @ApiProperty({ description: 'Email address of the user (analytics export only)', nullable: true, type: String })
  userEmail!: string | null;

  @ApiProperty({
    description: 'Email address of the supervising user (analytics export only)',
    nullable: true,
    type: String,
  })
  supervisorEmail!: string | null;
}

/** One billing transaction of the export with its parties, usage and items. */
export class BillingTransactionExportRowDto {
  @ApiProperty({ description: 'The unique identifier of the billing transaction', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user', example: 1 })
  userId!: number;

  @ApiProperty({ description: 'The user who the billing transaction belongs to', ...ref('User') })
  user?: object;

  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The credit amount of the billing transaction (negative for refunds/top-ups)' })
  amount!: number;

  @ApiProperty({ description: 'The user ID of the user who caused the billing transaction', type: Number })
  initiatorId!: number | null;

  @ApiProperty({ description: 'The user who initiated the billing transaction', ...ref('User') })
  initiator?: object | null;

  @ApiProperty({
    description: 'The resource usage ID of the resource usage that caused the billing transaction',
    type: Number,
  })
  resourceUsageId!: number | null;

  @ApiProperty({ description: 'The resource usage that caused the billing transaction', ...ref('ResourceUsage') })
  resourceUsage?: object | null;

  @ApiProperty({
    description: 'The billing transaction ID of the billing transaction that is being refunded',
    type: Number,
  })
  refundOfId!: number | null;

  @ApiProperty({ description: 'The billing transaction that is being refunded', ...ref('BillingTransaction') })
  refundOf?: object | null;

  @ApiProperty({
    description: 'The billing transaction this one corrects; the corrected transaction itself is never changed',
    nullable: true,
    type: Number,
  })
  correctionOfId!: number | null;

  @ApiProperty({ description: 'The external reference e.g. sumup transaction ID', type: String })
  externalReference!: string | null;

  @ApiProperty({
    description: 'The status of the billing transaction',
    enum: BillingTransactionStatus,
    enumName: 'BillingTransactionStatus',
  })
  status!: BillingTransactionStatus;

  @ApiProperty({
    description: 'The custom items of the billing transaction',
    type: () => BillingTransactionItemDto,
    isArray: true,
  })
  items?: object[];

  @ApiProperty({
    description:
      'Email address of the user (analytics export only). Null unless the caller holds billing.manage or resources.reports.export.',
    nullable: true,
    type: String,
  })
  userEmail!: string | null;

  @ApiProperty({
    description:
      'Email address of the initiating user (analytics export only). Null unless the caller holds billing.manage or resources.reports.export.',
    nullable: true,
    type: String,
  })
  initiatorEmail!: string | null;
}
