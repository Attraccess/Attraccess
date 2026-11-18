import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../../types/response';
import { ResourceUsageResponseDto } from './resource-usage-response.dto';
import type { UsageSessionResponse } from './usage-session-response';

export class GetResourceHistoryResponseDto extends PaginatedResponse<UsageSessionResponse> {
  @ApiProperty({
    type: [ResourceUsageResponseDto],
  })
  data: UsageSessionResponse[];
}
