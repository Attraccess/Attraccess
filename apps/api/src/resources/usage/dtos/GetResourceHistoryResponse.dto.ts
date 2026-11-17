import type { UsageSession } from '@attraccess/application-models';
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../../types/response';
import { ResourceUsageResponseDto } from './resource-usage-response.dto';

export class GetResourceHistoryResponseDto extends PaginatedResponse<UsageSession> {
  @ApiProperty({
    type: [ResourceUsageResponseDto],
  })
  data: UsageSession[];
}
