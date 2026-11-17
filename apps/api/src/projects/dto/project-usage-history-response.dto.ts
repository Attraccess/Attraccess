import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type { ProjectUsageHistoryEntry } from '@attraccess/application-models';
import { PaginatedResponse } from '../../types/response';

export class ProjectUsageHistoryResponseDto implements PaginatedResponse<ProjectUsageHistoryEntry> {
  /** Sessions in the shape of the ResourceUsage schema, with their user, resource and project. */
  @ApiProperty({ type: 'array', items: { $ref: getSchemaPath('ResourceUsage') } })
  data!: ProjectUsageHistoryEntry[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ required: false })
  nextPage?: number;
}
