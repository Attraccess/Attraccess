import { ApiProperty } from '@nestjs/swagger';

export class UsageTransactionDto {
  @ApiProperty({ type: Number, nullable: true, description: 'The current user’s related billing transaction ID.' })
  transactionId!: number | null;
}
