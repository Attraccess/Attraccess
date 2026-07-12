import { BillingTransaction } from '@attraccess/database-entities';
import { PaginatedResponse } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class PaginatedBillingTransactionsResponseDto extends PaginatedResponse<BillingTransaction> {
  @ApiProperty({ type: [BillingTransaction] })
  data: BillingTransaction[];
}
