import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber } from 'class-validator';

export class AppKeyRequestDto {
  @ApiProperty({
    description: 'The UID of the card to get the app key for',
    example: '04A2B3C4D5E6',
  })
  @IsString()
  cardUID: string;

  @ApiProperty({
    description: 'The key number to generate',
    example: 1,
  })
  @IsNumber()
  keyNo: number;
}
