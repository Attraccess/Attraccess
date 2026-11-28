import { BillingTransactionStatus } from '@attraccess/application-models';
// The related user and usage are documented with their public schemas; they are not billing data.
import { UserDto } from '../../users-and-auth/users/dtos/user.dto';
import { ResourceUsageResponseDto } from '../../resources/usage/dtos/resource-usage-response.dto';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { SwitchedSessionChargeDto } from './switched-session-charge.dto';

/** Schema names stay `BillingTransaction*` so the published API description does not change. */
@ApiSchema({ name: 'BillingTransactionItem' })
export class BillingTransactionItemDto {
  @ApiProperty({ description: 'The unique identifier of the billing transaction item', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the billing transaction', example: 1 })
  billingTransactionId!: number;

  @ApiProperty({ description: 'The billing transaction', type: () => BillingTransactionDto })
  // Typed loosely: the transaction class is declared below, and a class used as a type here is read too early.
  billingTransaction?: object;

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

  @ApiProperty({
    nullable: true,
    required: false,
    type: () => Object,
    description:
      'Set when this charge is a share of a machine used by several people at once: the segments the person took part in',
  })
  allocation!: object | null;
}

@ApiSchema({ name: 'BillingTransaction' })
export class BillingTransactionDto {
  @ApiProperty({ description: 'The unique identifier of the billing transaction', example: 1 })
  id!: number;

  @ApiProperty({ description: 'The ID of the user', example: 1 })
  userId!: number;

  @ApiProperty({ description: 'The user who the billing transaction belongs to', type: () => UserDto })
  user?: unknown;

  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The credit amount of the billing transaction (negative for refunds/top-ups)' })
  amount!: number;

  @ApiProperty({ description: 'The user ID of the user who caused the billing transaction' })
  initiatorId?: number | null;

  @ApiProperty({ description: 'The user who initiated the billing transaction', type: () => UserDto })
  initiator?: unknown;

  @ApiProperty({ description: 'The resource usage ID of the resource usage that caused the billing transaction' })
  resourceUsageId?: number | null;

  @ApiProperty({
    description: 'The resource usage that caused the billing transaction',
    type: () => ResourceUsageResponseDto,
  })
  resourceUsage?: unknown;

  @ApiProperty({ description: 'The billing transaction ID of the billing transaction that is being refunded' })
  refundOfId?: number | null;

  @ApiProperty({ description: 'The billing transaction that is being refunded', type: () => BillingTransactionDto })
  refundOf?: BillingTransactionDto | null;

  @ApiProperty({
    description: 'The billing transaction this one corrects; the corrected transaction itself is never changed',
    nullable: true,
  })
  correctionOfId?: number | null;

  @ApiProperty({ description: 'The external reference e.g. sumup transaction ID' })
  externalReference?: string | null;

  @ApiProperty({
    description: 'The status of the billing transaction',
    enum: BillingTransactionStatus,
    enumName: 'BillingTransactionStatus',
  })
  status!: BillingTransactionStatus;

  @ApiProperty({
    description: 'The custom items of the billing transaction',
    type: () => BillingTransactionItemDto,
    isArray: true,
  })
  items?: BillingTransactionItemDto[];

  @ApiProperty({
    description:
      'Only on live events, for a charge of one part of a session whose project was switched. The event of a last part without any charge carries the removed pending transaction.',
    required: false,
    type: () => SwitchedSessionChargeDto,
  })
  switchedSession?: SwitchedSessionChargeDto;
}
