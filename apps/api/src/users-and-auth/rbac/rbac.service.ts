import { Permission, Role, UserRole, UserRoleSource } from '@attraccess/application-models';

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { DatabaseTransactions, TransactionScope } from '../../database/transaction-scope';
import { RbacOperations, RbacPersistence, RBAC_WRITES, RoleGrantConflictError } from './persistence/port';

import { type Redis } from 'ioredis';

import { VALKEY_CLIENT } from '../../valkey/valkey.module';

import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
} from './authorization-cache-invalidation';

import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';

import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

import { RoleWithUsageDto } from './dtos/role-with-usage.dto';

import { CreateRoleDto } from './dtos/create-role.dto';

import { UpdateRoleDto } from './dtos/update-role.dto';

@Injectable()
export class RbacService {
  constructor(
    protected readonly persistence: RbacPersistence,
    protected readonly transactions: DatabaseTransactions,
    protected readonly eventEmitter: EventEmitter2,
    @Optional() @Inject(VALKEY_CLIENT) protected readonly valkeyClient: Redis | null,
  ) {}

  protected readonly logger = new Logger(RbacService.name);

  // ponytail: TTL cache — local invalidation keeps single-instance latency low; TTL bounds staleness
  // in multi-instance Postgres deployments where a role change on another instance won't invalidate here.
  protected readonly CACHE_TTL_MS = 30_000;

  protected readonly MAX_CACHE_SIZE = 1_000;

  protected readonly permissionsCache = new Map<number, { permissions: Set<string>; ts: number }>();

  protected async permissionsChanged(userId?: number): Promise<void> {
    this.eventEmitter.emit(UserPermissionsChangedEvent.EVENT_NAME, new UserPermissionsChangedEvent(userId));
    if (!this.valkeyClient) {
      return;
    }
    try {
      await this.valkeyClient.publish(
        AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
        JSON.stringify({ source: authorizationCacheInvalidationSource, userId }),
      );
    } catch (error) {
      this.logger.error('Failed to publish authorization cache invalidation', error);
    }
  }

  async getEffectivePermissions(userId: number, bypassCache = false): Promise<Set<string>> {
    const entry = this.permissionsCache.get(userId);
    if (!bypassCache && entry && Date.now() - entry.ts < this.CACHE_TTL_MS) return new Set(entry.permissions);

    const permissions = new Set(await this.persistence.effectivePermissionKeys(userId));
    // FIFO eviction: drop the oldest entry when the cache is full
    if (this.permissionsCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.permissionsCache.keys().next().value;
      this.permissionsCache.delete(oldestKey);
    }
    this.permissionsCache.set(userId, { permissions, ts: Date.now() });
    return new Set(permissions);
  }

  // A parent scope reads uncommitted grants. Role CRUD never changes the permission catalogue.

  async getUserRoles(userId: number): Promise<UserRole[]> {
    return this.persistence.userRoles(userId);
  }

  async isLastAdministrator(userId: number, scope?: TransactionScope): Promise<boolean> {
    const operations = scope ? scope.resolve(RBAC_WRITES) : this.persistence;
    const role = await operations.roleByKey('administrator');
    if (!role || !(await operations.grant({ userId, roleId: role.id }))) return false;
    return (await operations.administratorGrantCount(role.id, userId)) === 0;
  }

  async getUserIdsWithPermission(permissionKey: string): Promise<number[]> {
    return this.persistence.userIdsWithPermission(permissionKey);
  }

  async syncSsoRoles(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    const changes = await this.transactions.run({ resourceIds: [], accountIds: [userId] }, async (scope) =>
      this.syncSsoRolesInTransaction(userId, roles, ssoProviderType, ssoProviderId, scope.resolve(RBAC_WRITES)),
    );
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
    return changes;
  }

  protected async syncSsoRolesInTransaction(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
    operations: RbacOperations,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    // roleKey -> external claim value that granted it (source metadata for the UI)
    const targetByKey = new Map(roles.map((r) => [r.roleKey, r.externalValue ?? null]));

    const currentSsoRoles = await operations.ssoGrants(userId, ssoProviderType, ssoProviderId);
    const removed: string[] = [];
    const added: string[] = [];
    const updated: string[] = [];

    for (const ur of currentSsoRoles) {
      if (!targetByKey.has(ur.role.key)) {
        // ponytail: last-administrator guardrail — transient IdP claim omission must not silently strip the last administrator
        if (ur.role.key === 'administrator') {
          const otherAdministratorCount = await operations.administratorGrantCount(ur.roleId, undefined, ur.id);
          if (otherAdministratorCount === 0) {
            continue;
          }
        }
        await operations.removeGrant(ur.id);
        removed.push(ur.role.key);
      }
    }

    const currentByKey = new Map(currentSsoRoles.map((ur) => [ur.role.key, ur]));
    for (const [roleKey, externalValue] of targetByKey) {
      const current = currentByKey.get(roleKey);
      if (current) {
        if ((current.externalValue ?? null) !== externalValue) {
          await operations.updateExternalValue(current.id, externalValue);
          updated.push(roleKey);
        }
        continue;
      }
      const role = await operations.roleByKey(roleKey);
      if (!role) continue;
      const existing = await operations.grant({
        userId,
        roleId: role.id,
        source: UserRoleSource.SSO,
        ssoProviderType,
        ssoProviderId,
      });
      if (!existing) {
        try {
          await operations.createGrant({
            userId,
            roleId: role.id,
            source: UserRoleSource.SSO,
            ssoProviderType,
            ssoProviderId,
            externalValue,
          });
          added.push(roleKey);
        } catch (err) {
          // A role granted concurrently by another provider is already effective.
          if (err instanceof RoleGrantConflictError) {
            // Another SSO provider already granted this role — unique(userId, roleId, source) violated; ignore
            this.logger.debug(`syncSsoRoles: role ${roleKey} already held via another provider for user ${userId}`);
          } else {
            throw err;
          }
        }
      }
    }
    return { added, removed, updated };
  }

  async assignRoleByKey(userId: number, roleKey: string, scope?: TransactionScope): Promise<UserRole | null> {
    const operations = scope ? scope.resolve(RBAC_WRITES) : this.persistence;
    const role = await operations.roleByKey(roleKey);
    if (!role) return null;
    const identity = { userId, roleId: role.id, source: UserRoleSource.MANUAL };
    const existing = await operations.grant(identity);
    if (existing) return existing;
    const result = await operations.createGrant(identity);
    if (!scope) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
    return result;
  }

  async assignDefaultRoles(userId: number, scope?: TransactionScope): Promise<void> {
    const operations = scope ? scope.resolve(RBAC_WRITES) : this.persistence;
    for (const role of await operations.defaultRoles()) {
      const identity = { userId, roleId: role.id, source: UserRoleSource.MANUAL };
      if (!(await operations.grant(identity))) await operations.createGrant(identity);
    }
    if (!scope) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
  }

  async assignRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<UserRole> {
    const userExists = await this.persistence.userExists(userId);
    if (!userExists) throw new UserNotFoundException(userId);

    const role = await this.persistence.roleById(roleId);

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // cannot-grant-what-you-don't-have: actor must hold every permission the role grants
    const rolePermKeys = role.rolePermissions.map((rp) => rp.permissionKey);
    const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException('You cannot grant a role whose permissions exceed your own');
    }

    const existing = await this.persistence.grant({ userId, roleId, source: UserRoleSource.MANUAL });
    if (existing) {
      return existing;
    }

    const saved = await this.persistence.createGrant({ userId, roleId, source: UserRoleSource.MANUAL });
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
    return saved;
  }

  async revokeRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<void> {
    const userExists = await this.persistence.userExists(userId);
    if (!userExists) throw new UserNotFoundException(userId);

    const role = await this.persistence.roleById(roleId);
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // cannot-revoke-what-you-don't-have: actor must hold every permission the role grants
    const rolePermKeys = role.rolePermissions.map((rp) => rp.permissionKey);
    const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException('You cannot revoke a role whose permissions exceed your own');
    }

    if (role.key === 'administrator') {
      // ponytail: wrap count+delete in a transaction to close the TOCTOU race where two concurrent
      // revocations could both see administratorCount=2, both pass the guard, and both proceed to delete
      await this.transactions.run({ resourceIds: [], accountIds: [userId] }, async (scope) => {
        const operations = scope.resolve(RBAC_WRITES);
        const administratorCount = await operations.administratorGrantCount(roleId);
        if (administratorCount <= 1) {
          throw new ForbiddenException('Cannot remove the last administrator from the system');
        }
        const removed = await operations.removeManualGrant(userId, roleId);
        if (!removed) {
          throw new ConflictException(
            'Role is not manually assigned to this user and cannot be revoked via this endpoint',
          );
        }
      });
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
      return;
    }

    const removed = await this.persistence.removeManualGrant(userId, roleId);
    if (!removed) {
      throw new ConflictException('Role is not manually assigned to this user and cannot be revoked via this endpoint');
    }
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
  }

  async getRoles(): Promise<Role[]> {
    return this.persistence.roles();
  }

  async getRoleKey(roleId: number): Promise<string | null> {
    return this.persistence.roleKey(roleId);
  }

  async getRolesWithUsage(): Promise<RoleWithUsageDto[]> {
    const roles = await this.persistence.roles(true);
    const counts = await this.persistence.roleUserCounts();
    const countByRoleId = new Map(counts.map((c) => [Number(c.roleId), Number(c.userCount)]));
    return roles.map((role) =>
      Object.assign(new RoleWithUsageDto(), role, { userCount: countByRoleId.get(role.id) ?? 0 }),
    );
  }

  protected async resolvePermissionKeys(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    const found = await this.persistence.permissionsByKeys(unique);
    if (found.length !== unique.length) {
      const known = new Set(found.map((p) => p.key));
      const unknown = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Unknown permission keys: ${unknown.join(', ')}`);
    }
    return unique;
  }

  // A parent scope reads uncommitted grants. Role CRUD never changes the permission catalogue.
  protected async countAdministratorEquivalentUsers(excludeRoleId?: number, scope?: TransactionScope): Promise<number> {
    const totalPermissions = await this.persistence.permissionCount();
    if (totalPermissions === 0) return 0;
    const operations = scope ? scope.resolve(RBAC_WRITES) : this.persistence;
    return operations.fullPermissionHolderCount(totalPermissions, excludeRoleId);
  }

  async getPermissions(): Promise<Permission[]> {
    return this.persistence.permissions();
  }

  protected async generateRoleKey(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-/, '')
        .replace(/-$/, '')
        .slice(0, 80) || 'role';
    let candidate = base;
    for (let suffix = 2; await this.persistence.roleKeyExists(candidate); suffix++) {
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async createRole(dto: CreateRoleDto, actorPermissions: Set<string>): Promise<Role> {
    const permissionKeys = await this.resolvePermissionKeys(dto.permissionKeys ?? []);
    this.assertActorHolds(actorPermissions, permissionKeys, 'grant');

    const role = await this.persistence.createRole({
      key: await this.generateRoleKey(dto.name),
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      isSystemManaged: false,
      isDefault: false,
    });
    if (permissionKeys.length > 0) await this.persistence.addPermissions(role.id, permissionKeys);
    const created = await this.persistence.roleById(role.id);
    return created as Role;
  }

  async updateRole(roleId: number, dto: UpdateRoleDto, actorPermissions: Set<string>): Promise<Role> {
    const role = await this.persistence.roleById(roleId);
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    if (role.isSystemManaged) {
      throw new ForbiddenException('System-managed roles cannot be modified');
    }

    if (dto.name !== undefined) role.name = dto.name.trim();
    if (dto.description !== undefined) role.description = dto.description.trim();

    if (dto.permissionKeys !== undefined) {
      const targetKeys = await this.resolvePermissionKeys(dto.permissionKeys);
      const currentKeys = new Set(role.rolePermissions.map((rp) => rp.permissionKey));
      const added = targetKeys.filter((k) => !currentKeys.has(k));
      const removed = [...currentKeys].filter((k) => !targetKeys.includes(k));
      this.assertActorHolds(actorPermissions, added, 'grant');
      this.assertActorHolds(actorPermissions, removed, 'revoke');

      await this.transactions.run({ resourceIds: [], accountIds: [] }, async (scope) => {
        const operations = scope.resolve(RBAC_WRITES);
        const adminsBefore = removed.length > 0 ? await this.countAdministratorEquivalentUsers(undefined, scope) : 0;
        await operations.saveRoleFields(role.id, role.name, role.description);
        if (removed.length > 0) {
          await operations.removePermissions(role.id, removed);
        }
        for (const permissionKey of added) {
          await operations.addPermission(role.id, permissionKey);
        }
        // same lockout guard as deleteRole: a permission removal must not drop the
        // administrator-equivalent user count from >0 to 0 (rolls back via the thrown exception)
        if (adminsBefore > 0 && (await this.countAdministratorEquivalentUsers(undefined, scope)) === 0) {
          throw new ForbiddenException(
            'Updating this role would leave no active user with full administrative permissions',
          );
        }
      });
      // a role's permission set changed — every user holding it is affected
      this.permissionsCache.clear();
      await this.permissionsChanged();
    } else {
      await this.persistence.saveRoleFields(role.id, role.name, role.description);
    }

    const updated = await this.persistence.roleById(roleId);
    return updated as Role;
  }

  async deleteRole(roleId: number, actorPermissions: Set<string>, reassignToRoleId?: number): Promise<void> {
    const role = await this.persistence.roleById(roleId);
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    if (role.isSystemManaged) {
      throw new ForbiddenException('System-managed roles cannot be deleted');
    }

    // deleting a role revokes its permissions from every assigned user — same rule as updateRole/revokeRole
    this.assertActorHolds(
      actorPermissions,
      role.rolePermissions.map((rp) => rp.permissionKey),
      'revoke',
    );

    let reassignTo: Role | null = null;
    if (reassignToRoleId !== undefined) {
      if (reassignToRoleId === roleId) {
        throw new BadRequestException('Cannot reassign users to the role being deleted');
      }
      reassignTo = await this.persistence.roleById(reassignToRoleId);
      if (!reassignTo) throw new NotFoundException(`Role ${reassignToRoleId} not found`);
      this.assertActorHolds(
        actorPermissions,
        reassignTo.rolePermissions.map((rp) => rp.permissionKey),
        'grant',
      );
    }

    // ponytail: conservative — ignores that a reassignment target could restore administrator-equivalence.
    // Delete blocks only if it would reduce the administrator-equivalent user count from >0 to 0.
    const adminsWithoutRole = await this.countAdministratorEquivalentUsers(roleId);
    if (adminsWithoutRole === 0 && (await this.countAdministratorEquivalentUsers()) > 0) {
      throw new ForbiddenException(
        'Deleting this role would leave no active user with full administrative permissions',
      );
    }

    await this.transactions.run({ resourceIds: [], accountIds: [] }, async (scope) => {
      const operations = scope.resolve(RBAC_WRITES);
      if (reassignTo) {
        const assignments = await operations.roleAssignments(roleId);
        const affectedUserIds = [...new Set(assignments.map((a) => a.userId))];
        for (const userId of affectedUserIds) {
          const existing = await operations.grant({ userId, roleId: reassignTo.id, source: UserRoleSource.MANUAL });
          if (!existing) {
            await operations.createGrant({ userId, roleId: reassignTo.id, source: UserRoleSource.MANUAL });
          }
        }
      }
      // FK cascades remove role_permission and user_role rows
      await operations.removeRole(roleId);
    });
    this.permissionsCache.clear();
    await this.permissionsChanged();
  }

  protected assertActorHolds(actorPermissions: Set<string>, keys: string[], action: 'grant' | 'revoke'): void {
    const missing = keys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException(`You cannot ${action} permissions you do not have: ${missing.join(', ')}`);
    }
  }
}
