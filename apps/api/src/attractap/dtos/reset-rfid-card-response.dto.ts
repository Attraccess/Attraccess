import { ApiProperty } from '@nestjs/swagger';

export class ResetNfcCardResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Reset initiated, continue on Reader',
  })
  message: string;
}
