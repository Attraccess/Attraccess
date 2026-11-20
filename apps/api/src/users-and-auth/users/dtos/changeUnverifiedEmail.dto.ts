import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUnverifiedEmailDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Username or email address of the account, as entered at sign-in', example: 'jane' })
  identifier: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The local password of the account', example: 'correct horse battery staple' })
  password: string;

  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The email address that should receive the activation link',
    example: 'jane@example.org',
  })
  newEmail: string;
}
