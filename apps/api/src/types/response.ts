import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResponse<T> {
  // data property should be defined and decorated in extending classes
  // Example: @ApiProperty({ type: [SpecificType] }) data: SpecificType[];
  data: T[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
