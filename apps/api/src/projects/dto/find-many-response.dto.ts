import { Project } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../types/response';

export class FindManyProjectsResponseDto implements PaginatedResponse<Project> {
  @ApiProperty({ type: Project, isArray: true })
  data: Project[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
