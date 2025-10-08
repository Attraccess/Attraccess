import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, Min } from 'class-validator';

export class ChangeBillingFactorDto {
  @ApiProperty({ description: 'The new billing factor', example: 50 })
  @IsNumber()
  @IsPositive()
  @Min(0)
  billingFactor!: number;
}
