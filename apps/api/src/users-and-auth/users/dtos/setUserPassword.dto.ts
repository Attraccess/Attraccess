import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetUserPasswordDto {
  @ApiProperty({
    description: 'The new password (validated server-side against the active password policy)',
    example: 'correct-horse-battery-staple-42',
  })
  @IsString()
  password: string;
}
