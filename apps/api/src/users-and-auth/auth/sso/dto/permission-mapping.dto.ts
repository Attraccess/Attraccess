import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class SSOPermissionMappingsDto {
  @ApiProperty({
    description: 'Role names that grant resource management permissions',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_resources'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  canManageResources?: string[];

  @ApiProperty({
    description: 'Role names that grant system configuration permissions',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_config_admin'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  canManageSystemConfiguration?: string[];

  @ApiProperty({
    description: 'Role names that grant user management permissions',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_admin'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  canManageUsers?: string[];

  @ApiProperty({
    description: 'Role names that grant billing management permissions',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_billing'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  canManageBilling?: string[];
}
