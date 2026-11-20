import { PaginatedResponse } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';
import { BillingTransactionDto } from './billing-transaction.dto';

export class TransactionsDto implements PaginatedResponse<BillingTransactionDto> {
  @ApiProperty({ type: [BillingTransactionDto] })
  data: BillingTransactionDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
