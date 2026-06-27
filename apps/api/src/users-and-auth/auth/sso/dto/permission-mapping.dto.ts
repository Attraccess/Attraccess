import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class SSOPermissionMappingsDto {
  @ApiProperty({
    description: 'SSO role names that grant the resource-manager RBAC role',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_resources'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  'resource-manager'?: string[];

  @ApiProperty({
    description: 'SSO role names that grant the system-admin RBAC role',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_config_admin'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  'system-admin'?: string[];

  @ApiProperty({
    description: 'SSO role names that grant the user-manager RBAC role',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_admin'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  'user-manager'?: string[];

  @ApiProperty({
    description: 'SSO role names that grant the billing-manager RBAC role',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_billing'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  'billing-manager'?: string[];
}
