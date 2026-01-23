import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({ description: 'The new email address', example: 'new.email@example.com' })
  @IsEmail()
  email!: string;
}
