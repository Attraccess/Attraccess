import type {
  PermissionRecord,
  RoleRecord,
  RoleWithUserCount,
  SsoRoleAssignmentTarget,
  SsoRoleChanges,
  UserRoleRecord,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

/**
 * Roles, permissions and role assignments. Operations that take a `context` run inside the caller's unit of work and
 * see its uncommitted state; without one they use the application connection. Role reads include the permissions
 * the role grants.
 */
export interface RbacStore {
  /** Every permission key granted to the user through any of their roles. */
  permissionKeysOf(userId: number): Promise<string[]>;
  /** Ids of active (not deleted) users holding a role that grants the permission. */
  userIdsWithPermission(permissionKey: string): Promise<number[]>;
  findUserRoles(userId: number): Promise<UserRoleRecord[]>;
  userExists(userId: number): Promise<boolean>;
  findRoleByKey(key: string, context?: TransactionContext): Promise<RoleRecord | null>;
  findRoleById(roleId: number, context?: TransactionContext): Promise<RoleRecord | null>;
  findDefaultRoles(context?: TransactionContext): Promise<RoleRecord[]>;
  roleKeyOf(roleId: number): Promise<string | null>;
  findManualAssignment(userId: number, roleId: number, context?: TransactionContext): Promise<UserRoleRecord | null>;
  addManualAssignment(userId: number, roleId: number, context?: TransactionContext): Promise<UserRoleRecord>;
  /** Removes the manual assignment. False when the user did not hold the role manually. */
  revokeManualAssignment(userId: number, roleId: number, context?: TransactionContext): Promise<boolean>;
  /** True when the user holds the administrator role and no other active user does. */
  isLastAdministrator(userId: number, context?: TransactionContext): Promise<boolean>;
  /** Active users holding the role. */
  countActiveRoleHolders(roleId: number, context?: TransactionContext): Promise<number>;
  /** Active users whose roles together grant every permission, ignoring the given role. */
  countAdministratorEquivalentUsers(excludeRoleId?: number, context?: TransactionContext): Promise<number>;
  /**
   * Makes the user's SSO-sourced assignments of one provider match `targets`, in `scope`. A transient claim omission
   * never strips the last administrator.
   */
  syncSsoAssignments(
    userId: number,
    targets: SsoRoleAssignmentTarget[],
    providerType: string,
    providerId: number,
    context: TransactionContext,
  ): Promise<SsoRoleChanges>;

  listRoles(): Promise<RoleRecord[]>;
  listRolesWithUserCounts(): Promise<RoleWithUserCount[]>;
  listPermissions(): Promise<PermissionRecord[]>;
  /** The subset of `keys` that are known permissions. */
  findKnownPermissionKeys(keys: string[]): Promise<string[]>;
  roleKeyTaken(key: string): Promise<boolean>;
  /** Creates a custom role and its permission grants atomically. */
  createRole(role: { key: string; name: string; description: string }, permissionKeys: string[]): Promise<RoleRecord>;
  updateRoleDetails(
    roleId: number,
    details: { name: string; description: string },
    context?: TransactionContext,
  ): Promise<void>;
  addRolePermissions(roleId: number, permissionKeys: string[], context: TransactionContext): Promise<void>;
  removeRolePermissions(roleId: number, permissionKeys: string[], context: TransactionContext): Promise<void>;
  /** Gives every holder of `fromRoleId` a manual assignment of `toRoleId` unless they have it. */
  reassignRoleHolders(fromRoleId: number, toRoleId: number, context: TransactionContext): Promise<void>;
  /** Deletes the role; its permission grants and assignments go with it. */
  deleteRole(roleId: number, context: TransactionContext): Promise<void>;
}

export const RBAC_STORE = Symbol.for('attraccess.users-and-auth.rbac-store');
