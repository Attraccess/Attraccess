import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class SumupTopUpDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  @ApiProperty({ type: Number, example: 100, minimum: 1 })
  amount: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String, example: '1234567890' })
  readerId: string;
}
