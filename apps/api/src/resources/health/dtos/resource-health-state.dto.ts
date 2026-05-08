import { ApiProperty } from '@nestjs/swagger';
import { ResourceHealthSource, ResourceHealthStatus } from '@attraccess/database-entities';

export class ResourceHealthStateDto {
  @ApiProperty({ description: 'The health record id', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The resource ID this state belongs to', example: 1 })
  resourceId!: number;

  @ApiProperty({
    description: 'Identifier for the source reporting health (empty for the resource default).',
    example: 'Shelly',
  })
  identifier!: string;

  @ApiProperty({ enum: ResourceHealthStatus, enumName: 'ResourceHealthStatus' })
  status!: ResourceHealthStatus;

  @ApiProperty({ required: false, nullable: true, example: 'not connected' })
  reason!: string | null;

  @ApiProperty({ enum: ResourceHealthSource, enumName: 'ResourceHealthSource' })
  source!: ResourceHealthSource;

  @ApiProperty({ description: 'When the state was last reported', type: String, format: 'date-time' })
  lastReportedAt!: string;
}

export class ResourceHealthSummaryDto {
  @ApiProperty({ description: 'The resource ID', example: 1 })
  resourceId!: number;

  @ApiProperty({ description: 'Whether the resource is currently considered healthy', example: true })
  isHealthy!: boolean;

  @ApiProperty({
    description: 'Individual health state entries (one per identifier). Empty if no entries exist yet.',
    type: () => ResourceHealthStateDto,
    isArray: true,
  })
  entries!: ResourceHealthStateDto[];

  @ApiProperty({
    description: 'Subset of entries that are unhealthy (convenience for clients showing warnings).',
    type: () => ResourceHealthStateDto,
    isArray: true,
  })
  unhealthyEntries!: ResourceHealthStateDto[];
}
