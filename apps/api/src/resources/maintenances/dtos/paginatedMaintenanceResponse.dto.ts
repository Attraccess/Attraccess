import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../../types/response';
import { ResourceMaintenance } from '@attraccess/database-entities';

export class PaginatedMaintenanceResponse extends PaginatedResponse<ResourceMaintenance> {
  @ApiProperty({
    type: [ResourceMaintenance],
    description: 'List of maintenances',
  })
  data: ResourceMaintenance[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
