import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

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
    description:
      'Role or group names to evaluate against the configured RBAC role mappings. ' +
      'Values are matched against the `roleMappings` configured on the SSO provider.',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_admin', 'attraccess_billing'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}
