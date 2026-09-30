import { BillingTransaction } from '@attraccess/database-entities';
import { PaginatedResponseWithNextPage } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedBillingTransactionsResponseDto extends PaginatedResponseWithNextPage<BillingTransaction> {
  @ApiProperty({ type: [BillingTransaction] })
  data: BillingTransaction[];
}
