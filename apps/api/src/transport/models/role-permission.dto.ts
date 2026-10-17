import { ApiProperty } from '@nestjs/swagger';
import { Role } from './role.dto';
import { Permission } from './permission.dto';
import type { ResponseFields } from '../response-mapper';

export class RolePermission {
  id!: number;

  roleId!: number;

  @ApiProperty({
    description: 'The permission key granted by this assignment',
    example: 'resources.read',
  })
  permissionKey!: string;

  createdAt!: Date;

  role!: Role;

  permission!: Permission;
  static readonly responseFields: ResponseFields = {
    id: null,
    roleId: null,
    permissionKey: null,
    createdAt: null,
    role: () => Role,
    permission: () => Permission,
  };
}
