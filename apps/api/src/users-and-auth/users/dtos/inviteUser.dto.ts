import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({
    example: 'johndoe',
    description: 'The username for the new user',
  })
  @IsString()
  username: string;

  @ApiProperty({ required: false, type: String, nullable: true, maxLength: 100, description: 'Optional first name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string | null;

  @ApiProperty({ required: false, type: String, nullable: true, maxLength: 100, description: 'Optional last name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'The email address for the new user',
  })
  @IsEmail()
  email: string;
}
