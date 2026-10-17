import { ApiProperty } from '@nestjs/swagger';
import { ResourceUsage } from '../../transport/models/resourceUsage.dto';
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
