import type { UserRoleSource } from './user-role';

export interface PermissionRecord {
  key: string;
  label: string;
  description: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RolePermissionRecord {
  id: number;
  roleId: number;
  permissionKey: string;
  createdAt: Date;
}

export interface RoleRecord {
  id: number;
  key: string;
  name: string;
  description: string;
  isSystemManaged: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Present when the role was read together with the permissions it grants. */
  rolePermissions?: RolePermissionRecord[];
}

export interface RoleWithUserCount extends RoleRecord {
  userCount: number;
}

export interface UserRoleRecord {
  id: number;
  userId: number;
  roleId: number;
  source: UserRoleSource;
  ssoProviderType: string | null;
  ssoProviderId: number | null;
  externalValue: string | null;
  createdAt: Date;
  updatedAt: Date;
  role?: RoleRecord;
}

export interface SsoRoleAssignmentTarget {
  roleKey: string;
  externalValue?: string | null;
}

export interface SsoRoleChanges {
  added: string[];
  removed: string[];
  updated: string[];
}
