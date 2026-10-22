import { BillingTransaction } from './billing-transaction.dto';
import { ApiProperty } from '@nestjs/swagger';
import type { ResponseFields } from '../response-mapper';

export class BillingTransactionItem {
  @ApiProperty({ description: 'The unique identifier of the billing transaction item', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the billing transaction', example: 1 })
  billingTransactionId!: number;

  @ApiProperty({ description: 'The billing transaction', type: () => BillingTransaction })
  billingTransaction!: BillingTransaction;

  @ApiProperty({ description: 'The name of the billing transaction item', example: 'Credit top-up' })
  name!: string;

  @ApiProperty({
    description: 'The description of the billing transaction item',
    example: 'Credit top-up for user 1',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description: 'The external reference of the billing transaction item',
    example: '1234567890',
    nullable: true,
  })
  externalReference!: string | null;

  @ApiProperty({ description: 'The unit price of the billing transaction item', example: '100' })
  unitPrice!: number;

  @ApiProperty({ description: 'The quantity of the billing transaction item', example: '100' })
  quantity!: number;

  @ApiProperty({
    description: 'Raw milliseconds used to calculate this duration charge; null for legacy or non-duration items',
    nullable: true,
    required: false,
  })
  durationMs!: number | null;

  @ApiProperty({
    nullable: true,
    required: false,
    description:
      'Exact metered quantity, without a unit; null with a captured meter price means the final reading was unavailable',
  })
  meterQuantity!: string | null;

  @ApiProperty({ nullable: true, required: false, description: 'Captured price per measured value' })
  meterCreditsPerUnit!: number | null;
  static readonly responseFields: ResponseFields = {
    id: null,
    billingTransactionId: null,
    billingTransaction: () => BillingTransaction,
    name: null,
    description: null,
    externalReference: null,
    unitPrice: null,
    quantity: null,
    durationMs: null,
    meterQuantity: null,
    meterCreditsPerUnit: null,
  };
}
