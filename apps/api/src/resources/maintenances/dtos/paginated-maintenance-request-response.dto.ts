import { ApiProperty } from '@nestjs/swagger';
import { ResourceMaintenanceRequest } from '@attraccess/database-entities';

export class PaginatedMaintenanceRequestResponse {
  @ApiProperty({
    description: 'The maintenance requests for the current page',
    type: [ResourceMaintenanceRequest],
  })
  data: ResourceMaintenanceRequest[];

  @ApiProperty({ description: 'Total number of matching requests', example: 5 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of items per page', example: 10 })
  limit: number;
}
