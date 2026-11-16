import { PaginatedResponseWithNextPage } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';
import { BillingTransactionExportRowDto } from './analyticsExportRows.dto';

export class PaginatedBillingTransactionsResponseDto extends PaginatedResponseWithNextPage<BillingTransactionExportRowDto> {
  @ApiProperty({ type: [BillingTransactionExportRowDto] })
  data: BillingTransactionExportRowDto[];
}
