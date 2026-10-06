import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class EnrollNfcCardDto {
  @ApiProperty({
    description: 'The ID of the reader to enroll the NFC card on',
    example: 1,
  })
  @IsNumber()
  readerId: number;

  @ApiPropertyOptional({
    description: 'Card owner; defaults to yourself. Managing another user requires users.rfid-cards.manage.',
    example: 123,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;
}
