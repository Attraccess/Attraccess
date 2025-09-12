import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ModifyBalanceDto {
  @ApiProperty({
    description: 'The amount to modify the balance by',
    example: 100,
  })
  @IsNumber()
  amount: number;
}
