import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthenticationType } from '@attraccess/database-entities';

export class CreateUserDto {
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

  @ApiProperty({
    description: 'The password for the new user',
    example: 'password123',
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'The authentication strategy to use',
    enum: [AuthenticationType.LOCAL_PASSWORD],
    example: AuthenticationType.LOCAL_PASSWORD,
    enumName: 'AuthenticationType',
  })
  @IsIn([AuthenticationType.LOCAL_PASSWORD])
  strategy: AuthenticationType.LOCAL_PASSWORD;
}
