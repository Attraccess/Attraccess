import { Resource } from './resource.dto';
import { PaginatedResponse } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResourceResponseDto extends PaginatedResponse<Resource> {
  @ApiProperty({ type: [Resource] })
  data: Resource[];

  @ApiProperty({
    enum: ['all', 'permitted'],
    enumName: 'ResourceVisibilityScope',
    description:
      '"permitted" when the server narrowed the list to the machines this caller may see (machine list visibility), "all" otherwise.',
  })
  visibilityScope: 'all' | 'permitted';
}
