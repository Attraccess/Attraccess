import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.dto';
import { ResourceUsage } from './resourceUsage.dto';
import { BillingTransactionItem as BillingTransactionItems } from './billing-transaction-item.dto';
import { BillingTransactionStatus } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class BillingTransaction {
  @ApiProperty({
    description: 'The unique identifier of the billing transaction',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the user',
    example: 1,
  })
  userId!: number;

  @ApiProperty({ description: 'The user who the billing transaction belongs to', type: () => User })
  user!: User;

  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The credit amount of the billing transaction (negative for refunds/top-ups)' })
  amount!: number;

  @ApiProperty({ description: 'The user ID of the user who caused the billing transaction' })
  initiatorId!: number | null;

  @ApiProperty({ description: 'The user who initiated the billing transaction', type: () => User })
  initiator!: User | null;

  @ApiProperty({ description: 'The resource usage ID of the resource usage that caused the billing transaction' })
  resourceUsageId!: number | null;

  @ApiProperty({ description: 'The resource usage that caused the billing transaction', type: () => ResourceUsage })
  resourceUsage!: ResourceUsage | null;

  @ApiProperty({ description: 'The billing transaction ID of the billing transaction that is being refunded' })
  refundOfId!: number | null;

  @ApiProperty({ description: 'The billing transaction that is being refunded', type: () => BillingTransaction })
  refundOf!: BillingTransaction | null;

  @ApiProperty({
    description: 'The billing transaction this one corrects; the corrected transaction itself is never changed',
    nullable: true,
  })
  correctionOfId!: number | null;

  correctionOf?: BillingTransaction | null;

  @ApiProperty({ description: 'The external reference e.g. sumup transaction ID' })
  externalReference!: string | null;

  @ApiProperty({
    description: 'The status of the billing transaction',
    enum: BillingTransactionStatus,
    enumName: 'BillingTransactionStatus',
  })
  status!: BillingTransactionStatus;

  @ApiProperty({
    description: 'The custom items of the billing transaction',
    type: () => BillingTransactionItems,
    isArray: true,
  })
  items!: BillingTransactionItems[];
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    user: () => User,
    createdAt: null,
    updatedAt: null,
    amount: null,
    initiatorId: null,
    initiator: () => User,
    resourceUsageId: null,
    resourceUsage: () => ResourceUsage,
    refundOfId: null,
    refundOf: () => BillingTransaction,
    correctionOfId: null,
    correctionOf: () => BillingTransaction,
    externalReference: null,
    status: null,
    items: () => BillingTransactionItems,
  };
}

export { BillingTransactionStatus } from '@attraccess/application-models';
