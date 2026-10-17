import type { Permission, Role, UserRole, UserRoleSource } from '@attraccess/application-models';
import { operationToken } from '../../../database/transaction-scope';

export interface RoleGrantIdentity {
  userId: number;
  roleId: number;
  source?: UserRoleSource;
  ssoProviderType?: string;
  ssoProviderId?: number;
}
export type NewRoleGrant = RoleGrantIdentity & Pick<UserRole, 'source'> & { externalValue?: string | null };
export type NewRole = Pick<Role, 'key' | 'name' | 'description' | 'isSystemManaged' | 'isDefault'>;
export class RoleGrantConflictError extends Error {}

/** Operations bound to one database transaction; authorization decisions remain in RbacService. */
export abstract class RbacOperations {
  abstract roleByKey(key: string): Promise<Role | null>;
  abstract roleById(id: number): Promise<Role | null>;
  abstract grant(identity: RoleGrantIdentity): Promise<UserRole | null>;
  abstract ssoGrants(userId: number, providerType: string, providerId: number): Promise<UserRole[]>;
  abstract roleAssignments(roleId: number): Promise<UserRole[]>;
  abstract administratorGrantCount(roleId: number, excludeUserId?: number, excludeGrantId?: number): Promise<number>;
  abstract createGrant(input: NewRoleGrant): Promise<UserRole>;
  abstract removeGrant(id: number): Promise<void>;
  abstract removeManualGrant(userId: number, roleId: number): Promise<boolean>;
  abstract updateExternalValue(id: number, value: string | null): Promise<void>;
  abstract defaultRoles(): Promise<Role[]>;
  abstract saveRoleFields(id: number, name: string, description: string): Promise<void>;
  abstract removePermissions(roleId: number, keys: readonly string[]): Promise<void>;
  abstract addPermission(roleId: number, key: string): Promise<void>;
  abstract removeRole(id: number): Promise<void>;
  abstract fullPermissionHolderCount(totalPermissions: number, excludeRoleId?: number): Promise<number>;
}
export const RBAC_WRITES = operationToken<RbacOperations>('rbac-writes', [
  'roleByKey',
  'roleById',
  'grant',
  'ssoGrants',
  'roleAssignments',
  'administratorGrantCount',
  'createGrant',
  'removeGrant',
  'removeManualGrant',
  'updateExternalValue',
  'defaultRoles',
  'saveRoleFields',
  'removePermissions',
  'addPermission',
  'removeRole',
  'fullPermissionHolderCount',
]);

export abstract class RbacPersistence extends RbacOperations {
  abstract effectivePermissionKeys(userId: number): Promise<string[]>;
  abstract userRoles(userId: number): Promise<UserRole[]>;
  abstract userIdsWithPermission(key: string): Promise<number[]>;
  abstract userExists(userId: number): Promise<boolean>;
  abstract roles(ordered?: boolean): Promise<Role[]>;
  abstract roleKey(id: number): Promise<string | null>;
  abstract roleUserCounts(): Promise<Array<{ roleId: number; userCount: number }>>;
  abstract permissionsByKeys(keys: readonly string[]): Promise<Permission[]>;
  abstract permissionCount(): Promise<number>;
  abstract permissions(): Promise<Permission[]>;
  abstract roleKeyExists(key: string): Promise<boolean>;
  abstract createRole(input: NewRole): Promise<Role>;
  abstract addPermissions(roleId: number, keys: readonly string[]): Promise<void>;
}
