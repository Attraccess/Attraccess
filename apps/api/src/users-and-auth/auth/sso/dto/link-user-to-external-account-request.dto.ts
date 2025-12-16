import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LinkUserToExternalAccountRequestDto {
  @ApiProperty({
    description: 'The password of the user',
    example: 'password',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({
    description: 'The short-lived token issued by the backend during SSO linking',
    example: 'eyJhbGciOi...signed',
  })
  @IsString()
  @IsNotEmpty()
  linkToken!: string;
}
