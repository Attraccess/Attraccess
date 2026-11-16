import { PaginatedResponseWithNextPage } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceUsageExportRowDto } from './analyticsExportRows.dto';

export class PaginatedResourceUsageResponseDto extends PaginatedResponseWithNextPage<ResourceUsageExportRowDto> {
  @ApiProperty({ type: [ResourceUsageExportRowDto] })
  data: ResourceUsageExportRowDto[];
}
