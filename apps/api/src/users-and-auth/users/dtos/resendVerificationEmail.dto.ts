import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationEmailDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The email address to resend the verification email to',
    example: 'john.doe@example.com',
  })
  email: string;
}
