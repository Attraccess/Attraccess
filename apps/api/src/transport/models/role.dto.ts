import { ApiProperty } from '@nestjs/swagger';
import { RolePermission } from './role-permission.dto';
import { UserRole } from './user-role.dto';
import type { ResponseFields } from '../response-mapper';

export class Role {
  @ApiProperty({
    description: 'Unique identifier of the role',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'Stable string key for this role',
    example: 'resource-manager',
  })
  key!: string;

  @ApiProperty({
    description: 'Human-readable name of the role',
    example: 'Resource Manager',
  })
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

  @ApiProperty({
    description: 'Whether this role is assigned to all new users by default',
    example: false,
  })
  isDefault!: boolean;

  createdAt!: Date;

  updatedAt!: Date;

  @ApiProperty({ type: () => [RolePermission], description: 'Permissions granted by this role', required: false })
  rolePermissions!: RolePermission[];

  userRoles!: UserRole[];
  static readonly responseFields: ResponseFields = {
    id: null,
    key: null,
    name: null,
    description: null,
    isSystemManaged: null,
    isDefault: null,
    createdAt: null,
    updatedAt: null,
    rolePermissions: () => RolePermission,
    userRoles: () => UserRole,
  };
}
