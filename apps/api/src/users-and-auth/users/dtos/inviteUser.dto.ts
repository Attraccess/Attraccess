import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { USER_NAME_MAX_LENGTH } from '../accounts/normalize-name';
import { UserNameInput } from './user-name-input.decorator';

export class InviteUserDto {
  @ApiProperty({
    example: 'johndoe',
    description: 'The username for the new user',
  })
  @IsString()
  username: string;

  @ApiProperty({
    required: false,
    type: String,
    nullable: true,
    maxLength: USER_NAME_MAX_LENGTH,
    description: 'Optional first name',
  })
  @UserNameInput({ required: false })
  firstName?: string | null;

  @ApiProperty({
    required: false,
    type: String,
    nullable: true,
    maxLength: USER_NAME_MAX_LENGTH,
    description: 'Optional last name',
  })
  @UserNameInput({ required: false })
  lastName?: string | null;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'The email address for the new user',
  })
  @IsEmail()
  email: string;
}
