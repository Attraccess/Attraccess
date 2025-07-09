import { ApiProperty } from '@nestjs/swagger';

export class AppKeyResponseDto {
  @ApiProperty({
    description: 'Generated key in hex format',
    example: '0A1B2C3D4E5F6789',
  })
  key: string;
}
