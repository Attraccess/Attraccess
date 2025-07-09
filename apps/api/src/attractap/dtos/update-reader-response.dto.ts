import { ApiProperty } from '@nestjs/swagger';
import { Attractap } from '@attraccess/plugins-backend-sdk';

export class UpdateReaderResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Reader updated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'The updated reader',
    type: Attractap,
  })
  reader: Attractap;
}
