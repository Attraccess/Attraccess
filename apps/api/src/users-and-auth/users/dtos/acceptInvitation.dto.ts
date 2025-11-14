import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptInvitationDto {
  @IsString()
  @ApiProperty({
    description: 'The token to accept the invitation',
    example: '1234567890',
  })
  token: string;

  @IsEmail()
  @ApiProperty({
    description: 'The email of the invite',
    example: 'john.doe@example.com',
  })
  email: string;

  @IsString()
  @ApiProperty({
    description: 'The password for the user',
    example: 'password123',
  })
  password: string;
}
