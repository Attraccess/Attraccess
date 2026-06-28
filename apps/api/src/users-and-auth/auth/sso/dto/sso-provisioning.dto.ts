import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
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
    description:
      'Role or group names to evaluate against the configured RBAC role mappings. ' +
      'This is the preferred way to provision roles — values are matched against the ' +
      '`permissionMappings` configured on the SSO provider.',
    required: false,
    isArray: true,
    type: String,
    example: ['attraccess_admin', 'attraccess_billing'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  // ─── Legacy boolean fields (deprecated) ────────────────────────────────────
  // These fields existed when Attraccess used a flat boolean permission model.
  // They are still accepted for backward compatibility with existing IdP
  // provisioning configurations, and are mapped to the equivalent RBAC roles:
  //   canManageResources        → resource-manager
  //   canManageSystemConfiguration → system-admin
  //   canManageUsers            → user-manager
  //   canManageBilling          → billing-manager
  //
  // New integrations should use `roles` + per-provider `permissionMappings` instead.
  // ───────────────────────────────────────────────────────────────────────────

  /** @deprecated Use `roles` + provider `permissionMappings` instead. Grants the `resource-manager` role when `true`. */
  @ApiProperty({
    description: '[Deprecated] Use `roles` + provider `permissionMappings` instead. Grants the `resource-manager` RBAC role when `true`.',
    required: false,
    deprecated: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageResources?: boolean;

  /** @deprecated Use `roles` + provider `permissionMappings` instead. Grants the `system-admin` role when `true`. */
  @ApiProperty({
    description: '[Deprecated] Use `roles` + provider `permissionMappings` instead. Grants the `system-admin` RBAC role when `true`.',
    required: false,
    deprecated: true,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageSystemConfiguration?: boolean;

  /** @deprecated Use `roles` + provider `permissionMappings` instead. Grants the `user-manager` role when `true`. */
  @ApiProperty({
    description: '[Deprecated] Use `roles` + provider `permissionMappings` instead. Grants the `user-manager` RBAC role when `true`.',
    required: false,
    deprecated: true,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageUsers?: boolean;

  /** @deprecated Use `roles` + provider `permissionMappings` instead. Grants the `billing-manager` role when `true`. */
  @ApiProperty({
    description: '[Deprecated] Use `roles` + provider `permissionMappings` instead. Grants the `billing-manager` RBAC role when `true`.',
    required: false,
    deprecated: true,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  canManageBilling?: boolean;
}
