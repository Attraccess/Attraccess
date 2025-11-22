import { ApiProperty } from '@nestjs/swagger';
import { ResourceUsage } from '@attraccess/database-entities';
import { PaginatedResponse } from '../../types/response';

export class ProjectUsageHistoryResponseDto implements PaginatedResponse<ResourceUsage> {
  @ApiProperty({ type: () => ResourceUsage, isArray: true })
  data!: ResourceUsage[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ required: false })
  nextPage?: number;
}

