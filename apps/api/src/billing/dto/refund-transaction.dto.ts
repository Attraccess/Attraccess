import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RefundTransactionDto {
  @IsNumber()
  @ApiProperty({ type: Number, example: 100 })
  @Min(0)
  amount!: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ type: String, example: 'Reason for refund', nullable: true })
  reason?: string | null;
}
