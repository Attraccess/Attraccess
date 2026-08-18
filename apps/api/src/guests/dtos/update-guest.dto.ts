import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateGuestDto {
  @ApiProperty({
    description: 'Display name of the guest',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiProperty({
    description: 'Optional contact email for the guest. Pass null to remove the email.',
    example: 'john@example.com',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({
    description: 'Whether the guest account is enabled',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  guestEnabled?: boolean;
}
