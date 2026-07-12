import { ResourceUsage } from '@attraccess/database-entities';
import { PaginatedResponseWithNextPage } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResourceUsageResponseDto extends PaginatedResponseWithNextPage<ResourceUsage> {
  @ApiProperty({ type: [ResourceUsage] })
  data: ResourceUsage[];
}
