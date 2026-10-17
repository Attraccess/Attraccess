import { Resource } from '../../transport/models/resource.dto';
import { PaginatedResponse } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResourceResponseDto extends PaginatedResponse<Resource> {
  @ApiProperty({ type: [Resource] })
  data: Resource[];
}
