import { Type } from 'class-transformer';
import { IsISO8601, IsString, Matches, MaxLength, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUDIT_ACTIONS } from './audit-policy';

const RESOURCE_AUDIT_ACTIONS = [
  'maintenance_schedule.created',
  'maintenance_schedule.updated',
  'maintenance_schedule.deleted',
  'supervision.approved',
  'supervision.rejected',
];
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
const ALL_AUDIT_ACTIONS = [...AUDIT_ACTIONS, ...RESOURCE_AUDIT_ACTIONS, ...PROJECT_AUDIT_ACTIONS, 'billing.transaction.created', 'billing.transaction.updated'];

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const eventPrefix = /^(?:billing|maintenance_schedule|project|supervision|wago)(?:\.[a-z_]+)*\.?$/;

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

  @ApiPropertyOptional({ enum: ['billing', 'project', 'resource', 'wago'] })
  @IsOptional()
  @IsIn(['billing', 'project', 'resource', 'wago'])
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

  @ApiPropertyOptional({ enum: ['billing.transaction', 'project', 'project.member', 'project.invitation', 'resource', 'wago.controller', 'wago.commissioning'] })
  @IsOptional()
  @IsIn(['billing.transaction', 'project', 'project.member', 'project.invitation', 'resource', 'wago.controller', 'wago.commissioning'])
  subjectType?: string;
}
