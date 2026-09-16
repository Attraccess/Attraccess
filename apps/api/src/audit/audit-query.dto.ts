import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUDIT_ACTION_QUERY_PATTERN,
  AUDIT_DOMAIN_QUERY_PATTERN,
  AUDIT_EVENT_PREFIX_QUERY_PATTERN,
  AUDIT_SUBJECT_TYPE_QUERY_PATTERN,
} from './audit-domains';
import { knownAuditActions, knownAuditDomains, knownEventPrefixes, knownSubjectTypes } from './audit-vocabulary';

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Filter values validate against the live audit vocabulary: core constants plus
 * the domains, actions and subject types that loaded plugins registered. The
 * host never hardcodes a plugin value; `GET /admin/audit-log/meta` enumerates
 * what is currently known. All filters bind as SQL parameters.
 */
function IsKnownAuditValue(
  name: string,
  shape: RegExp,
  known: () => readonly string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && shape.test(value) && known().includes(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a recognized audit value`;
        },
      },
    });
  };
}

const IsKnownAuditDomain = () =>
  IsKnownAuditValue('isKnownAuditDomain', AUDIT_DOMAIN_QUERY_PATTERN, knownAuditDomains);
const IsKnownAuditAction = () =>
  IsKnownAuditValue('isKnownAuditAction', AUDIT_ACTION_QUERY_PATTERN, knownAuditActions);
const IsKnownSubjectType = () =>
  IsKnownAuditValue('isKnownSubjectType', AUDIT_SUBJECT_TYPE_QUERY_PATTERN, knownSubjectTypes);

/** Shape-checked, and the leading segment must be a known action prefix (core or plugin domain). */
const IsKnownEventPrefix = (validationOptions?: ValidationOptions) =>
  function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isKnownEventPrefix',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !AUDIT_EVENT_PREFIX_QUERY_PATTERN.test(value)) return false;
          return knownEventPrefixes().includes(value.split('.')[0]);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must start with a recognized audit event prefix`;
        },
      },
    });
  };

export class AuditQueryDto {
  @ApiPropertyOptional({
    description: 'Event action prefix, e.g. resource. or a plugin domain prefix',
    pattern: AUDIT_EVENT_PREFIX_QUERY_PATTERN.source,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsKnownEventPrefix()
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

  @ApiPropertyOptional({
    description: 'Exact event action, e.g. resource.updated. Plugin actions use their domain prefix.',
    pattern: AUDIT_ACTION_QUERY_PATTERN.source,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @IsKnownAuditAction()
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
    description: 'Audit domain: a core domain or one contributed by an installed plugin.',
    pattern: AUDIT_DOMAIN_QUERY_PATTERN.source,
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsKnownAuditDomain()
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
    description: 'Exact subject type, e.g. resource or identity.user. Plugin subject types use their domain prefix.',
    pattern: AUDIT_SUBJECT_TYPE_QUERY_PATTERN.source,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsKnownSubjectType()
  subjectType?: string;
}
