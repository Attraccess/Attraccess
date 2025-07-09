import { ApiProperty } from '@nestjs/swagger';
import { ResourceFlowLog } from '@attraccess/database-entities';
import { PaginatedResponse } from '../../../types/response';

export class ResourceFlowLogsResponseDto extends PaginatedResponse<ResourceFlowLog> {
  @ApiProperty({
    type: [ResourceFlowLog],
    description: 'Array of flow log entries, ordered by creation time (newest first)',
  })
  data: ResourceFlowLog[];
}
