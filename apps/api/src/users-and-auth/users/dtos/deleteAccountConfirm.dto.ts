import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountConfirmDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The delete account confirmation token',
    example: '1234567890',
  })
  token: string;

  @IsEmail()
  @ApiProperty({
    description: 'The email to delete',
    example: 'john.doe@example.com',
  })
  email: string;
}
