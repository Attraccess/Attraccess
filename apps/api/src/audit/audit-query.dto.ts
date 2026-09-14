import { ADMINISTRATION_AUDIT_ACTIONS } from './audit-administration-policy';
import { Type } from 'class-transformer';
import { IsISO8601, IsString, Matches, MaxLength, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUDIT_ACTIONS, IDENTITY_AUDIT_ACTIONS, RESOURCE_AUDIT_ACTIONS } from './audit-policy';

const ALL_AUDIT_ACTIONS = [
  ...AUDIT_ACTIONS,
  ...IDENTITY_AUDIT_ACTIONS,
  ...RESOURCE_AUDIT_ACTIONS,
  ...ADMINISTRATION_AUDIT_ACTIONS,
  'billing.transaction.created',
  'billing.transaction.updated',
];

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const eventPrefix =
  /^(?:billing|email_layout|email_template|identity|introduction|maintenance_schedule|mqtt_server|plugin|resource|resource_group|settings|supervision|wago)(?:\.[a-z_]+)*\.?$/;

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

  @ApiPropertyOptional({ enum: ['administration', 'billing', 'identity', 'resource', 'wago'] })
  @IsOptional()
  @IsIn(['administration', 'billing', 'identity', 'resource', 'wago'])
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
      'identity.password_policy',
      'identity.role',
      'identity.user',
      'resource',
      'resource_group',
      'wago.controller',
      'wago.commissioning',
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
    'identity.password_policy',
    'identity.role',
    'identity.user',
    'resource',
    'resource_group',
    'wago.controller',
    'wago.commissioning',
  ])
  subjectType?: string;
}
