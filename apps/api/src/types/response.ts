import { ApiProperty } from '@nestjs/swagger';

/** 1-based page number of the next page, or undefined when `page` is the last one. */
export function computeNextPage(page: number, limit: number, total: number): number | undefined {
  return page * limit < total ? page + 1 : undefined;
}

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

  @ApiProperty({ required: false })
  nextPage?: number;
}
