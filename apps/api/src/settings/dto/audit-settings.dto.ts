import { ApiProperty, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import { AUDIT_DOMAIN_QUERY_PATTERN, CORE_AUDIT_DOMAINS, CoreAuditDomain } from '../../audit/audit-domains';

export class AuditSettingsDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    enum: CORE_AUDIT_DOMAINS,
    isArray: true,
    default: ['administration', 'attractap', 'identity', 'project', 'resource'],
  })
  @IsArray()
  @ArrayMaxSize(CORE_AUDIT_DOMAINS.length)
  @ArrayUnique()
  @IsIn(CORE_AUDIT_DOMAINS, { each: true })
  domains!: CoreAuditDomain[];

  @ApiProperty({
    type: String,
    isArray: true,
    default: [],
    description:
      'Plugin-contributed audit domains an administrator turned off. Registered plugin domains record while absent from this list.',
  })
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @Matches(AUDIT_DOMAIN_QUERY_PATTERN, { each: true })
  plugin_domains_disabled!: string[];

  @ApiProperty({ default: 90, minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  retention_days!: number;
}

export class UpdateAuditSettingsDto extends PartialType(AuditSettingsDto) {}
