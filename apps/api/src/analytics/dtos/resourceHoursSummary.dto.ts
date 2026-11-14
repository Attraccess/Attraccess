import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseWithNextPage } from '../../types/response';

export class ResourceHoursSummaryRowDto {
  @ApiProperty()
  resourceId: number;

  @ApiProperty()
  resourceName: string;

  @ApiProperty({
    description: 'Custom metadata key-value pairs configured for the resource',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ description: 'Usage sessions that overlap the range' })
  sessionCount: number;

  @ApiProperty({ description: 'Person time: the clipped duration of every session added up (ms)' })
  personDurationMs: number;

  @ApiProperty({
    description: 'Machine time with a session: the union of the clipped session ranges, overlaps count once (ms)',
  })
  sessionDurationMs: number;

  @ApiProperty({ description: 'Whether operating data exists for the resource' })
  operatingDataAvailable: boolean;

  @ApiProperty({ description: 'Machine running time in the range (ms); null without operating data', nullable: true })
  operatingDurationMs: number | null;

  @ApiProperty({
    description: 'Machine running time outside any session (ms); null without operating data',
    nullable: true,
  })
  unattributedOperatingDurationMs: number | null;

  @ApiProperty({ description: 'The values may still change: the range ends in the future or a session is open' })
  isProvisional: boolean;
}

export class PaginatedResourceHoursSummaryResponseDto extends PaginatedResponseWithNextPage<ResourceHoursSummaryRowDto> {
  @ApiProperty({ type: [ResourceHoursSummaryRowDto] })
  data: ResourceHoursSummaryRowDto[];
}
