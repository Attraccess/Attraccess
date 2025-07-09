import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ResetNfcCardDto {
  @ApiProperty({
    description: 'The ID of the reader to reset the NFC card on',
    example: 1,
  })
  @IsNumber()
  readerId: number;

  @ApiProperty({
    description: 'The ID of the NFC card to reset',
    example: 123,
  })
  @IsNumber()
  cardId: number;
}
