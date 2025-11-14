import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({
    example: 'johndoe',
    description: 'The username for the new user',
  })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'The email address for the new user',
  })
  @IsEmail()
  email: string;
}
