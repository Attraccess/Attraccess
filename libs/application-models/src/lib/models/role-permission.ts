import { Role } from './role';
import { Permission } from './permission';

export interface RolePermission {
  id: number;
  roleId: number;
  permissionKey: string;
  createdAt: Date;
  role: Role;
  permission: Permission;
}
