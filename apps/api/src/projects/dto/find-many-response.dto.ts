import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponse } from '../../types/response';
import { ProjectWithAccessDto } from './project-access.dto';

export class FindManyProjectsResponseDto implements PaginatedResponse<ProjectWithAccessDto> {
  @ApiProperty({ type: ProjectWithAccessDto, isArray: true })
  data: ProjectWithAccessDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  nextPage?: number;
}
