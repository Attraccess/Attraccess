import { PaginatedResponseWithNextPage } from '../../types/response';
import { ApiProperty } from '@nestjs/swagger';
import { BillingTransactionExportRow } from '../analytics-reader.port';
import { BillingTransactionExportRowDto } from './analyticsExportRows.dto';

export class PaginatedBillingTransactionsResponseDto extends PaginatedResponseWithNextPage<BillingTransactionExportRow> {
  @ApiProperty({ type: [BillingTransactionExportRowDto] })
  data: BillingTransactionExportRow[];
}
