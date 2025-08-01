import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetUserPasswordDto {
  @ApiProperty({
    description: 'The new password for the user',
    example: 'newSecurePassword123',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
