import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class ChangeBillingFactorDto {
  @ApiProperty({ description: 'The new billing factor', example: 50 })
  @IsNumber()
  @Min(0)
  billingFactor!: number;
}
