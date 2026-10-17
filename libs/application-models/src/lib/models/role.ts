import { RolePermission } from './role-permission';
import { UserRole } from './user-role';

export interface Role {
  id: number;
  key: string;
  name: string;
  description: string;
  isSystemManaged: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions: RolePermission[];
  userRoles: UserRole[];
}
