import type { PermissionRecord, RoleRecord, RoleWithUserCount } from '@attraccess/application-models';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';

/** The role schema of the API. The OpenAPI schema names stay `Role`, `RolePermission` and `Permission`. */
@ApiSchema({ name: 'RolePermission' })
export class RolePermissionDto {
  id!: number;

  roleId!: number;

  @ApiProperty({ description: 'The permission key granted by this assignment', example: 'resources.read' })
  permissionKey!: string;

  createdAt!: Date;
}

@ApiSchema({ name: 'Role' })
export class RoleDto {
  @ApiProperty({ description: 'Unique identifier of the role', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Stable string key for this role', example: 'resource-manager' })
  key!: string;

  @ApiProperty({ description: 'Human-readable name of the role', example: 'Resource Manager' })
  name!: string;

  @ApiProperty({
    description: 'Description of what this role allows',
    example: 'Can manage all resources in the system',
  })
  description!: string;

  @ApiProperty({
    description: 'Whether this role is managed by the system and cannot be deleted',
    example: true,
  })
  isSystemManaged!: boolean;

  @ApiProperty({ description: 'Whether this role is assigned to all new users by default', example: false })
  isDefault!: boolean;

  createdAt!: Date;

  updatedAt!: Date;

  @ApiProperty({ type: [RolePermissionDto], description: 'Permissions granted by this role', required: false })
  rolePermissions?: RolePermissionDto[];
}

@ApiSchema({ name: 'Permission' })
export class PermissionDto {
  @ApiProperty({ description: 'Stable string key identifying this permission', example: 'resources.read' })
  key!: string;

  @ApiProperty({ description: 'Human-readable label for this permission', example: 'Read Resources' })
  label!: string;

  @ApiProperty({
    description: 'Description of what this permission grants',
    example: 'Allows reading resource information',
  })
  description!: string;

  @ApiProperty({ description: 'Category grouping for this permission', example: 'resources' })
  category!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export function toRoleDto(role: RoleRecord): RoleDto {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystemManaged: role.isSystemManaged,
    isDefault: role.isDefault,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    ...(role.rolePermissions
      ? {
          rolePermissions: role.rolePermissions.map((rp) => ({
            id: rp.id,
            roleId: rp.roleId,
            permissionKey: rp.permissionKey,
            createdAt: rp.createdAt,
          })),
        }
      : {}),
  };
}

export function toPermissionDto(permission: PermissionRecord): PermissionDto {
  return {
    key: permission.key,
    label: permission.label,
    description: permission.description,
    category: permission.category,
    createdAt: permission.createdAt,
    updatedAt: permission.updatedAt,
  };
}

export type { RoleWithUserCount };
