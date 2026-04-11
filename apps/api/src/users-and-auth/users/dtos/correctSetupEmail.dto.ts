import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CorrectSetupEmailDto {
  @ApiProperty({ description: 'The admin username', example: 'admin' })
  @IsString()
  username!: string;

  @ApiProperty({ description: 'The admin password', example: 'password123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ description: 'The corrected email address', example: 'correct@example.com' })
  @IsEmail()
  newEmail!: string;
}
