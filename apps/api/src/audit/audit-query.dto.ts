import { ADMINISTRATION_AUDIT_ACTIONS } from './audit-administration-policy';
import { Type } from 'class-transformer';
import { IsISO8601, IsString, Matches, MaxLength, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ATTRACTAP_AUDIT_ACTIONS, AUDIT_ACTIONS, IDENTITY_AUDIT_ACTIONS, RESOURCE_AUDIT_ACTIONS } from './audit-policy';

const PROJECT_AUDIT_ACTIONS = [
  'project.created',
  'project.updated',
  'project.deleted',
  'project.archived',
  'project.unarchived',
  'project.member.added',
  'project.member.removed',
  'project.invitation.sent',
  'project.invitation.accepted',
  'project.invitation.rejected',
  'project.invitation.revoked',
];
const SSO_AUDIT_ACTIONS = [
  'sso.provider.created',
  'sso.provider.updated',
  'sso.provider.deleted',
  'sso.provisioning.sessions_revoked',
  'sso.provisioning.user_created',
  'sso.provisioning.user_deleted',
  'sso.provisioning.permissions_synced',
];
const ALL_AUDIT_ACTIONS = [
  ...SSO_AUDIT_ACTIONS,
  ...ATTRACTAP_AUDIT_ACTIONS,
  ...AUDIT_ACTIONS,
  ...PROJECT_AUDIT_ACTIONS,
  ...IDENTITY_AUDIT_ACTIONS,
  ...RESOURCE_AUDIT_ACTIONS,
  ...ADMINISTRATION_AUDIT_ACTIONS,
  'billing.transaction.created',
  'billing.transaction.updated',
];
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const eventPrefix =
  /^(?:sso|attractap|project|health|usage_session|retraining|introduction|resource|resource_group|billing|maintenance_schedule|supervision|wago|identity|settings|email_template|email_layout|mqtt_server|plugin)(?:\.[a-z_]+)*\.?$/;

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Event action prefix', pattern: eventPrefix.source, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(eventPrefix)
  eventPrefix?: string;

  @ApiPropertyOptional({ description: 'Inclusive event timestamp lower bound' })
  @IsOptional()
  @MaxLength(35)
  @Matches(timestamp)
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive event timestamp upper bound' })
  @IsOptional()
  @MaxLength(35)
  @Matches(timestamp)
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ enum: ALL_AUDIT_ACTIONS })
  @IsOptional()
  @IsIn(ALL_AUDIT_ACTIONS)
  action?: string;

  @ApiPropertyOptional({ type: Number, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ description: 'Exclusive descending row ID cursor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  beforeId?: number;

  @ApiPropertyOptional({
    enum: ['administration', 'sso', 'attractap', 'project', 'billing', 'resource', 'wago', 'identity'],
  })
  @IsOptional()
  @IsIn(['administration', 'sso', 'attractap', 'project', 'billing', 'resource', 'wago', 'identity'])
  domain?: string;

  @ApiPropertyOptional({ enum: ['attempted', 'succeeded', 'failed'] })
  @IsOptional()
  @IsIn(['attempted', 'succeeded', 'failed'])
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  operationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  actorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  subjectId?: number;

  @ApiPropertyOptional({
    enum: [
      'setting',
      'email-template',
      'email-layout',
      'mqtt-server',
      'plugin-package',
      'plugin-registry',
      'plugin-policy',
      'billing.transaction',
      'project',
      'project.member',
      'project.invitation',
      'resource',
      'resource_group',
      'resource.group',
      'sso.provider',
      'user',
      'wago.controller',
      'wago.commissioning',
      'identity.user',
      'identity.role',
      'identity.password_policy',
      'attractap.reader',
      'attractap.card',
    ],
  })
  @IsOptional()
  @IsIn([
    'setting',
    'email-template',
    'email-layout',
    'mqtt-server',
    'plugin-package',
    'plugin-registry',
    'plugin-policy',
    'billing.transaction',
    'project',
    'project.member',
    'project.invitation',
    'resource',
    'resource_group',
    'resource.group',
    'sso.provider',
    'user',
    'wago.controller',
    'wago.commissioning',
    'identity.user',
    'identity.role',
    'identity.password_policy',
    'attractap.reader',
    'attractap.card',
  ])
  subjectType?: string;
}
