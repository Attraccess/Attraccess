import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class RefundTransactionDto {
  @IsNumber()
  @ApiProperty({ type: Number, example: 100 })
  @Min(0)
  amount!: number;
}
