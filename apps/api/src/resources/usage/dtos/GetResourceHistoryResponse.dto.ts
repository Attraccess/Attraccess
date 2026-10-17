import { ResourceUsage } from '../../../transport/models/resourceUsage.dto';
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../../types/response';

export class GetResourceHistoryResponseDto extends PaginatedResponse<ResourceUsage> {
  @ApiProperty({
    type: [ResourceUsage],
  })
  data: ResourceUsage[];
}
