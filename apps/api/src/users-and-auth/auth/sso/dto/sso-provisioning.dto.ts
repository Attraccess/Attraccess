import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { ToBoolean } from '../../../../common/request-transformers';

export class SSOProvisioningUserDto {
  @ApiProperty({
    description: 'The SSO subject (sub) identifier',
    required: false,
    example: '00u1abcd1234',
  })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({
    description: 'The user email address',
    required: false,
    example: 'user@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;
}

export class SSOProvisioningPermissionsDto extends SSOProvisioningUserDto {
  @ApiProperty({
    description: 'Whether the user can manage resources',
    required: false,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageResources?: boolean;

  @ApiProperty({
    description: 'Whether the user can manage system configuration',
    required: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageSystemConfiguration?: boolean;

  @ApiProperty({
    description: 'Whether the user can manage users',
    required: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageUsers?: boolean;

  @ApiProperty({
    description: 'Whether the user can manage billing',
    required: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageBilling?: boolean;
}
