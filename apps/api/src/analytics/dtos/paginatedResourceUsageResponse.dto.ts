import { ResourceUsage } from '@attraccess/database-entities';
import { PaginatedResponse } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResourceUsageResponseDto extends PaginatedResponse<ResourceUsage> {
  @ApiProperty({ type: [ResourceUsage] })
  data: ResourceUsage[];

  @ApiProperty({ required: false })
  nextPage?: number;
}
