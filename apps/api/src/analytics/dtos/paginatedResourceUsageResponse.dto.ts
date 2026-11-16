import { PaginatedResponseWithNextPage } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceUsageExportRow } from '../analytics-reader.port';
import { ResourceUsageExportRowDto } from './analyticsExportRows.dto';

export class PaginatedResourceUsageResponseDto extends PaginatedResponseWithNextPage<ResourceUsageExportRow> {
  @ApiProperty({ type: [ResourceUsageExportRowDto] })
  data: ResourceUsageExportRow[];
}
