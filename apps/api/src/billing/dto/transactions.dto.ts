import { BillingTransaction } from '@attraccess/database-entities';
import { PaginatedResponse } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';

export class TransactionsDto implements PaginatedResponse<BillingTransaction> {
  @ApiProperty({ type: [BillingTransaction] })
  data: BillingTransaction[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
