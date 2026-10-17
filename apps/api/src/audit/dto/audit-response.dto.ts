import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Explicit response schema keeps the generated admin client aligned with persisted audit entries. */
export class AuditEntryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ type: String, format: 'date-time' }) at!: Date;
  @ApiProperty() domain!: string;
  @ApiProperty({ type: String, nullable: true }) pluginId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() operationId!: string;
  @ApiProperty({ type: Number, nullable: true }) actorId!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorUsername?: string | null;
  @ApiPropertyOptional({ enum: ['recorded', 'current'] }) actorUsernameSource?: 'recorded' | 'current';
  @ApiProperty({ type: String, nullable: true }) authenticationMethod!: string | null;
  @ApiProperty({ type: Number, nullable: true }) apiTokenId!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ipAddress?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) userAgent?: string | null;
  @ApiProperty({ enum: ['attempted', 'succeeded', 'failed'] }) outcome!: 'attempted' | 'succeeded' | 'failed';
  @ApiProperty() subjectType!: string;
  @ApiProperty({ type: Number, nullable: true }) subjectId!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) subjectLabel?: string | null;
  @ApiPropertyOptional({ enum: ['recorded', 'current'] }) subjectLabelSource?: 'recorded' | 'current';
  @ApiProperty({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] },
  })
  details!: Record<string, string | number | boolean | null>;
}

export class AuditPageDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[];
  @ApiProperty({ type: Number, nullable: true }) nextCursor!: number | null;
}

/** One audit domain known to the host: a core domain or a domain contributed by a loaded plugin. */
export class AuditDomainMetaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['core', 'plugin'] }) source!: 'core' | 'plugin';
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Plugin-provided display labels keyed by locale, e.g. { en: "Demo devices" }.',
  })
  labels?: Record<string, string>;
}

/** Enumerates the currently known audit filter vocabulary: core values plus plugin contributions. */
export class AuditMetaDto {
  @ApiProperty({ type: [AuditDomainMetaDto] }) domains!: AuditDomainMetaDto[];
  @ApiProperty({ type: [String] }) subjectTypes!: string[];
  @ApiProperty({ type: [String] }) actions!: string[];
}
