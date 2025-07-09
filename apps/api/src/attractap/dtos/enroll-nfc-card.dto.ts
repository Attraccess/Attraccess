import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class EnrollNfcCardDto {
  @ApiProperty({
    description: 'The ID of the reader to enroll the NFC card on',
    example: 1,
  })
  @IsNumber()
  readerId: number;
}
