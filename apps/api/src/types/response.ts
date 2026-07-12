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
}

/** Base for paginated responses whose endpoint computes `nextPage` (see computeNextPage).
 * Kept separate from PaginatedResponse so endpoints that never populate the field
 * don't advertise it in their schema. */
export class PaginatedResponseWithNextPage<T> extends PaginatedResponse<T> {
  @ApiProperty({ required: false })
  nextPage?: number;
}
