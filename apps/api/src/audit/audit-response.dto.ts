import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Explicit response schema keeps the generated admin client aligned with persisted audit entries. */
export class AuditEntryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ type: String, format: 'date-time' }) at!: Date;
  @ApiProperty() domain!: string;
  @ApiProperty() pluginId!: string;
  @ApiProperty() action!: string;
  @ApiProperty() operationId!: string;
  @ApiProperty({ type: Number, nullable: true }) actorId!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorUsername?: string | null;
  @ApiProperty({ type: String, nullable: true }) authenticationMethod!: string | null;
  @ApiProperty({ type: Number, nullable: true }) apiTokenId!: number | null;
  @ApiProperty({ enum: ['attempted', 'succeeded', 'failed'] }) outcome!: 'attempted' | 'succeeded' | 'failed';
  @ApiProperty() subjectType!: string;
  @ApiProperty({ type: Number, nullable: true }) subjectId!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) subjectLabel?: string | null;
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
