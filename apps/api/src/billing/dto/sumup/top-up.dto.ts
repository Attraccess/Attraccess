import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class SumupTopUpDto {
  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({ type: Number, example: 100 })
  tokenCount: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String, example: '1234567890' })
  readerId: string;
}
