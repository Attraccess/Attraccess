import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'The new password (validated server-side against the active password policy)',
    example: 'correct-horse-battery-staple-42',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'The token for the user',
    example: '1234567890',
  })
  @IsString()
  token: string;
}
