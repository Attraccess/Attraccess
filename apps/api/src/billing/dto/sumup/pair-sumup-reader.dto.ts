import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class PairSumUpReaderDto {
  @ApiProperty({ type: String, example: '1234567890', required: true })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(9)
  pairingCode: string;

  @ApiProperty({ type: String, example: 'Reader 1', required: true })
  @IsString()
  @IsNotEmpty()
  name: string;
}
