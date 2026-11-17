import {
  type PermissionRecord,
  type RoleRecord,
  type RoleWithUserCount,
  type SsoRoleChanges,
  type UserRoleRecord,
} from '@attraccess/application-models';
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
import { type Redis } from 'ioredis';
import { VALKEY_CLIENT } from '../../valkey/valkey.module';
import { describeValkeyError } from '../../valkey/valkey-outage-logging';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';
import type { TransactionContext } from '../../database/transaction-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../database/unit-of-work';
import { roleAuditEvent } from './role-audit';
import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
} from './authorization-cache-invalidation';
import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RBAC_STORE, type RbacStore } from './rbac.port';

@Injectable()
export class RbacService {
  constructor(
    @Inject(RBAC_STORE) protected readonly store: RbacStore,
    @Inject(UNIT_OF_WORK) protected readonly uow: UnitOfWork,
    protected readonly eventEmitter: EventEmitter2,
    // optional: Valkey is an optional deployment component; the service works without a cache
    @Optional() @Inject(VALKEY_CLIENT) protected readonly valkeyClient: Redis | null,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
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
      this.logger.error(`Failed to publish authorization cache invalidation (${describeValkeyError(error)})`);
    }
  }

  async getEffectivePermissions(userId: number, bypassCache = false): Promise<Set<string>> {
    const entry = this.permissionsCache.get(userId);
    if (!bypassCache && entry && Date.now() - entry.ts < this.CACHE_TTL_MS) return new Set(entry.permissions);

    const permissions = new Set(await this.store.permissionKeysOf(userId));
    // FIFO eviction: drop the oldest entry when the cache is full
    if (this.permissionsCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.permissionsCache.keys().next().value;
      this.permissionsCache.delete(oldestKey);
    }
    this.permissionsCache.set(userId, { permissions, ts: Date.now() });
    return new Set(permissions);
  }

  async getUserRoles(userId: number): Promise<UserRoleRecord[]> {
    return this.store.findUserRoles(userId);
  }

  async isLastAdministrator(userId: number, context?: TransactionContext): Promise<boolean> {
    return this.store.isLastAdministrator(userId, context);
  }

  async getUserIdsWithPermission(permissionKey: string): Promise<number[]> {
    return this.store.userIdsWithPermission(permissionKey);
  }

  async syncSsoRoles(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
  ): Promise<SsoRoleChanges> {
    const changes = await this.uow.run((scope) =>
      this.store.syncSsoAssignments(userId, roles, ssoProviderType, ssoProviderId, scope),
    );
    // Periodic session re-syncs usually find no delta; skip invalidation fan-out for those.
    if (changes.added.length + changes.removed.length + changes.updated.length > 0) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
    return changes;
  }

  async assignRoleByKey(userId: number, roleKey: string, context?: TransactionContext): Promise<UserRoleRecord | null> {
    const role = await this.store.findRoleByKey(roleKey, context);
    if (!role) return null;
    const existing = await this.store.findManualAssignment(userId, role.id, context);
    if (existing) return existing;
    const result = await this.store.addManualAssignment(userId, role.id, context);
    if (!context) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
    return result;
  }

  async assignDefaultRoles(userId: number, context?: TransactionContext): Promise<void> {
    for (const role of await this.store.findDefaultRoles(context)) {
      if (!(await this.store.findManualAssignment(userId, role.id, context))) {
        await this.store.addManualAssignment(userId, role.id, context);
      }
    }
    if (!context) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
  }

  async assignRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<UserRoleRecord> {
    if (!(await this.store.userExists(userId))) throw new UserNotFoundException(userId);

    const role = await this.store.findRoleById(roleId);

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // cannot-grant-what-you-don't-have: actor must hold every permission the role grants
    const missing = this.permissionKeysOf(role).filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException('You cannot grant a role whose permissions exceed your own');
    }

    const existing = await this.store.findManualAssignment(userId, roleId);
    if (existing) {
      return existing;
    }

    const saved = await this.store.addManualAssignment(userId, roleId);
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
    return saved;
  }

  async revokeRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<void> {
    if (!(await this.store.userExists(userId))) throw new UserNotFoundException(userId);

    const role = await this.store.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // cannot-revoke-what-you-don't-have: actor must hold every permission the role grants
    const missing = this.permissionKeysOf(role).filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException('You cannot revoke a role whose permissions exceed your own');
    }

    if (role.key === 'administrator') {
      // ponytail: wrap count+delete in a unit of work to close the TOCTOU race where two concurrent
      // revocations could both see administratorCount=2, both pass the guard, and both proceed to delete
      await this.uow.run(async (scope) => {
        if ((await this.store.countActiveRoleHolders(roleId, scope)) <= 1) {
          throw new ForbiddenException('Cannot remove the last administrator from the system');
        }
        if (!(await this.store.revokeManualAssignment(userId, roleId, scope))) {
          throw new ConflictException(
            'Role is not manually assigned to this user and cannot be revoked via this endpoint',
          );
        }
      });
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
      return;
    }

    if (!(await this.store.revokeManualAssignment(userId, roleId))) {
      throw new ConflictException('Role is not manually assigned to this user and cannot be revoked via this endpoint');
    }
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
  }

  async getRoles(): Promise<RoleRecord[]> {
    return this.store.listRoles();
  }

  async getRoleKey(roleId: number): Promise<string | null> {
    return this.store.roleKeyOf(roleId);
  }

  async getRolesWithUsage(): Promise<RoleWithUserCount[]> {
    return this.store.listRolesWithUserCounts();
  }

  protected async resolvePermissionKeys(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    const found = await this.store.findKnownPermissionKeys(unique);
    if (found.length !== unique.length) {
      const known = new Set(found);
      const unknown = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Unknown permission keys: ${unknown.join(', ')}`);
    }
    return unique;
  }

  async getPermissions(): Promise<PermissionRecord[]> {
    return this.store.listPermissions();
  }

  protected permissionKeysOf(role: RoleRecord): string[] {
    return (role.rolePermissions ?? []).map((rp) => rp.permissionKey);
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
    for (let suffix = 2; await this.store.roleKeyTaken(candidate); suffix++) {
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async createRole(dto: CreateRoleDto, actorPermissions: Set<string>, origin: AuditOrigin): Promise<RoleRecord> {
    const permissionKeys = await this.resolvePermissionKeys(dto.permissionKeys ?? []);
    this.assertActorHolds(actorPermissions, permissionKeys, 'grant');

    const created = await this.store.createRole(
      {
        key: await this.generateRoleKey(dto.name),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
      },
      permissionKeys,
    );
    await this.audit.record(roleAuditEvent('role_created', created, origin));
    return created;
  }

  async updateRole(
    roleId: number,
    dto: UpdateRoleDto,
    actorPermissions: Set<string>,
    origin: AuditOrigin,
  ): Promise<RoleRecord> {
    const role = await this.store.findRoleById(roleId);
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    if (role.isSystemManaged) {
      throw new ForbiddenException('System-managed roles cannot be modified');
    }

    const name = dto.name !== undefined ? dto.name.trim() : role.name;
    const description = dto.description !== undefined ? dto.description.trim() : role.description;

    if (dto.permissionKeys !== undefined) {
      const targetKeys = await this.resolvePermissionKeys(dto.permissionKeys);
      const currentKeys = new Set(this.permissionKeysOf(role));
      const added = targetKeys.filter((k) => !currentKeys.has(k));
      const removed = [...currentKeys].filter((k) => !targetKeys.includes(k));
      this.assertActorHolds(actorPermissions, added, 'grant');
      this.assertActorHolds(actorPermissions, removed, 'revoke');

      await this.uow.run(async (scope) => {
        const adminsBefore =
          removed.length > 0 ? await this.store.countAdministratorEquivalentUsers(undefined, scope) : 0;
        await this.store.updateRoleDetails(role.id, { name, description }, scope);
        if (removed.length > 0) {
          await this.store.removeRolePermissions(role.id, removed, scope);
        }
        await this.store.addRolePermissions(role.id, added, scope);
        // same lockout guard as deleteRole: a permission removal must not drop the
        // administrator-equivalent user count from >0 to 0 (rolls back via the thrown exception)
        if (adminsBefore > 0 && (await this.store.countAdministratorEquivalentUsers(undefined, scope)) === 0) {
          throw new ForbiddenException(
            'Updating this role would leave no active user with full administrative permissions',
          );
        }
      });
      // a role's permission set changed — every user holding it is affected
      this.permissionsCache.clear();
      await this.permissionsChanged();
    } else {
      await this.store.updateRoleDetails(role.id, { name, description });
    }

    const updated = (await this.store.findRoleById(roleId)) as RoleRecord;
    await this.audit.record(roleAuditEvent('role_updated', updated, origin));
    return updated;
  }

  async deleteRole(
    roleId: number,
    actorPermissions: Set<string>,
    origin: AuditOrigin,
    reassignToRoleId?: number,
  ): Promise<void> {
    const role = await this.store.findRoleById(roleId);
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    if (role.isSystemManaged) {
      throw new ForbiddenException('System-managed roles cannot be deleted');
    }

    // deleting a role revokes its permissions from every assigned user — same rule as updateRole/revokeRole
    this.assertActorHolds(actorPermissions, this.permissionKeysOf(role), 'revoke');

    let reassignTo: RoleRecord | null = null;
    if (reassignToRoleId !== undefined) {
      if (reassignToRoleId === roleId) {
        throw new BadRequestException('Cannot reassign users to the role being deleted');
      }
      reassignTo = await this.store.findRoleById(reassignToRoleId);
      if (!reassignTo) throw new NotFoundException(`Role ${reassignToRoleId} not found`);
      this.assertActorHolds(actorPermissions, this.permissionKeysOf(reassignTo), 'grant');
    }

    // ponytail: conservative — ignores that a reassignment target could restore administrator-equivalence.
    // Delete blocks only if it would reduce the administrator-equivalent user count from >0 to 0.
    const adminsWithoutRole = await this.store.countAdministratorEquivalentUsers(roleId);
    if (adminsWithoutRole === 0 && (await this.store.countAdministratorEquivalentUsers()) > 0) {
      throw new ForbiddenException(
        'Deleting this role would leave no active user with full administrative permissions',
      );
    }

    await this.uow.run(async (scope) => {
      if (reassignTo) {
        await this.store.reassignRoleHolders(roleId, reassignTo.id, scope);
      }
      // FK cascades remove role_permission and user_role rows
      await this.store.deleteRole(roleId, scope);
    });
    this.permissionsCache.clear();
    await this.permissionsChanged();
    await this.audit.record(roleAuditEvent('role_deleted', role, origin));
  }

  protected assertActorHolds(actorPermissions: Set<string>, keys: string[], action: 'grant' | 'revoke'): void {
    const missing = keys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException(`You cannot ${action} permissions you do not have: ${missing.join(', ')}`);
    }
  }
}
