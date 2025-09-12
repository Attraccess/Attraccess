import { ApiProperty } from '@nestjs/swagger';

export class BalanceDto {
  @ApiProperty({ description: 'The balance of the user', type: Number })
  value: number;
}
