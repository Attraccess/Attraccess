import { ApiProperty } from '@nestjs/swagger';

export class EnrollNfcCardResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Enrollment initiated, continue on Reader',
  })
  message: string;
}
