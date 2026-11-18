import { Permission, Role, RolePermission, User, UserRole, UserRoleSource } from '@attraccess/database-entities';
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
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { type Redis } from 'ioredis';
import { EntityManager, Repository, In } from 'typeorm';
import { VALKEY_CLIENT } from '../../valkey/valkey.module';
import { describeValkeyError } from '../../valkey/valkey-outage-logging';
import { AUDIT_RECORDER, AuditOrigin, AuditRecorder } from '../../audit/recorder/audit-event';
import { roleAuditEvent } from './role-audit';
import { syncSsoRolesInTransaction } from './sso-role-sync';
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
    @InjectRepository(UserRole)
    protected readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    protected readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    protected readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    @InjectRepository(RolePermission)
    protected readonly rolePermissionRepository: Repository<RolePermission>,
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

  /**
   * Also fires for invalidations published by other instances (usage-access-cache re-emits them locally), so a
   * permission change or a plugin key changing availability elsewhere does not wait for the cache TTL here.
   */
  @OnEvent(UserPermissionsChangedEvent.EVENT_NAME)
  onPermissionsChanged(event: UserPermissionsChangedEvent): void {
    if (event.userId === undefined) this.permissionsCache.clear();
    else this.permissionsCache.delete(event.userId);
  }

  /** Drops every cached permission set, here and on other instances (e.g. plugin keys changed availability). */
  async invalidateAllPermissions(): Promise<void> {
    this.permissionsCache.clear();
    await this.permissionsChanged();
  }

  /**
   * Keys of plugins that are not loaded. Their grants stay in role_permission and api_token_permission, but they are
   * hidden from every catalog, grant nothing, and survive edits made by clients that cannot see them.
   */
  async getUnavailablePermissionKeys(): Promise<Set<string>> {
    const rows = await this.permissionRepository.findBy({ available: false });
    return new Set(rows.map((row) => row.key));
  }

  /** The role with its grants of unavailable plugin keys left out, as clients see it. */
  protected withoutUnavailable<T extends Role>(role: T, unavailable: Set<string>): T {
    if (unavailable.size === 0 || !role.rolePermissions) return role;
    role.rolePermissions = role.rolePermissions.filter((rp) => !unavailable.has(rp.permissionKey));
    return role;
  }

  protected async rolePermissionKeysOf(userId: number, available: boolean): Promise<Set<string>> {
    const rows = await this.userRoleRepository
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p', 'p.available = :available', { available: available ? 1 : 0 })
      .select('rp.permissionKey', 'permissionKey')
      .distinct(true)
      .where('ur.userId = :userId', { userId })
      .getRawMany<{ permissionKey: string }>();
    return new Set(rows.map((r) => r.permissionKey));
  }

  /**
   * The keys an actor may grant or revoke: their effective permissions plus the unavailable plugin keys their own
   * roles hold. Roles keep grants of unavailable keys and those apply again once the plugin loads, so the "cannot
   * grant what you don't have" rule must cover them; otherwise anyone could hand out a dormant `matter.*` grant while
   * Matter is not loaded. An API token or MCP grant adds only the dormant keys inside its own scope, which it keeps
   * like role grants.
   */
  async getGrantCeiling(actor: {
    id: number;
    effectivePermissions?: Set<string>;
    authenticationMethod?: string;
    permissionScope?: readonly string[];
  }): Promise<Set<string>> {
    const ceiling = new Set(actor.effectivePermissions ?? []);
    const scoped = actor.authenticationMethod === 'api-token' || actor.authenticationMethod === 'mcp-oauth';
    const scope = new Set(actor.permissionScope ?? []);
    for (const key of await this.rolePermissionKeysOf(actor.id, false)) {
      if (!scoped || scope.has(key)) ceiling.add(key);
    }
    return ceiling;
  }

  async getEffectivePermissions(userId: number, bypassCache = false): Promise<Set<string>> {
    const entry = this.permissionsCache.get(userId);
    if (!bypassCache && entry && Date.now() - entry.ts < this.CACHE_TTL_MS) return new Set(entry.permissions);

    // unavailable plugin keys grant nothing while their plugin is not loaded
    const permissions = await this.rolePermissionKeysOf(userId, true);
    // FIFO eviction: drop the oldest entry when the cache is full
    if (this.permissionsCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.permissionsCache.keys().next().value;
      this.permissionsCache.delete(oldestKey);
    }
    this.permissionsCache.set(userId, { permissions, ts: Date.now() });
    return new Set(permissions);
  }

  // pass `manager` to count against uncommitted in-transaction state (permissions table itself is never
  // modified by role CRUD, so the total always comes from the plain repository)

  async getUserRoles(userId: number): Promise<UserRole[]> {
    return this.userRoleRepository.find({
      where: { userId },
      relations: { role: true },
    });
  }

  async isLastAdministrator(userId: number, manager?: EntityManager): Promise<boolean> {
    const roleRepo = manager ? manager.getRepository(Role) : this.roleRepository;
    const urRepo = manager ? manager.getRepository(UserRole) : this.userRoleRepository;
    const administratorRole = await roleRepo.findOne({ where: { key: 'administrator' } });
    if (!administratorRole) return false;
    const isAdministrator = await urRepo.findOne({ where: { userId, roleId: administratorRole.id } });
    if (!isAdministrator) return false;
    const qb = manager ? manager.createQueryBuilder(UserRole, 'ur') : this.userRoleRepository.createQueryBuilder('ur');
    const otherAdministratorCount = await qb
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .where('ur.roleId = :roleId', { roleId: administratorRole.id })
      .andWhere('ur.userId != :userId', { userId })
      .getCount();
    return otherAdministratorCount === 0;
  }

  async getUserIdsWithPermission(permissionKey: string): Promise<number[]> {
    const rows = await this.userRoleRepository
      .createQueryBuilder('ur')
      .innerJoin('role_permission', 'rp', 'rp.roleId = ur.roleId')
      // Soft-deleted users keep their user_role rows (anonymizeAndSoftDelete only drops auth
      // details and sessions), so without this a deleted admin still counts as a permission
      // holder forever — e.g. as a supervisor who provably cannot supervise (ATT-867).
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .innerJoin('permission', 'p', 'p.key = rp.permissionKey AND p.available = 1')
      .select('DISTINCT ur.userId', 'userId')
      .where('rp.permissionKey = :permKey', { permKey: permissionKey })
      .getRawMany<{ userId: number }>();
    return rows.map((r) => r.userId);
  }

  async syncSsoRoles(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    const changes = await this.userRoleRepository.manager.transaction(async (manager) =>
      syncSsoRolesInTransaction(
        { userId, roles, ssoProviderType, ssoProviderId },
        manager.getRepository(UserRole),
        manager.getRepository(Role),
        this.logger,
      ),
    );
    // Periodic session re-syncs usually find no delta; skip invalidation fan-out for those.
    if (changes.added.length + changes.removed.length + changes.updated.length > 0) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
    return changes;
  }

  async assignRoleByKey(userId: number, roleKey: string, em?: EntityManager): Promise<UserRole | null> {
    const roleRepo = em ? em.getRepository(Role) : this.roleRepository;
    const urRepo = em ? em.getRepository(UserRole) : this.userRoleRepository;

    const role = await roleRepo.findOne({ where: { key: roleKey } });
    if (!role) return null;
    const existing = await urRepo.findOne({
      where: { userId, roleId: role.id, source: UserRoleSource.MANUAL },
    });
    if (existing) return existing;
    const result = await urRepo.save(urRepo.create({ userId, roleId: role.id, source: UserRoleSource.MANUAL }));
    if (!em) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
    return result;
  }

  async assignDefaultRoles(userId: number, em?: EntityManager): Promise<void> {
    const roleRepo = em ? em.getRepository(Role) : this.roleRepository;
    const urRepo = em ? em.getRepository(UserRole) : this.userRoleRepository;

    const defaultRoles = await roleRepo.find({ where: { isDefault: true } });
    for (const role of defaultRoles) {
      const existing = await urRepo.findOne({
        where: { userId, roleId: role.id, source: UserRoleSource.MANUAL },
      });
      if (!existing) {
        await urRepo.save(urRepo.create({ userId, roleId: role.id, source: UserRoleSource.MANUAL }));
      }
    }
    if (!em) {
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
    }
  }

  async assignRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<UserRole> {
    const userExists = await this.userRepository.existsBy({ id: userId });
    if (!userExists) throw new UserNotFoundException(userId);

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: { rolePermissions: true },
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // cannot-grant-what-you-don't-have: actor must hold every permission the role grants, dormant grants of
    // unavailable plugin keys included (callers pass getGrantCeiling)
    const rolePermKeys = role.rolePermissions.map((rp) => rp.permissionKey);
    const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException('You cannot grant a role whose permissions exceed your own');
    }

    const existing = await this.userRoleRepository.findOne({
      where: { userId, roleId, source: UserRoleSource.MANUAL },
    });
    if (existing) {
      return existing;
    }

    const userRole = this.userRoleRepository.create({
      userId,
      roleId,
      source: UserRoleSource.MANUAL,
    });
    const saved = await this.userRoleRepository.save(userRole);
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
    return saved;
  }

  async revokeRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<void> {
    const userExists = await this.userRepository.existsBy({ id: userId });
    if (!userExists) throw new UserNotFoundException(userId);

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: { rolePermissions: true },
    });
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
      await this.userRoleRepository.manager.transaction(async (manager) => {
        const administratorCount = await manager
          .createQueryBuilder(UserRole, 'ur')
          .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
          .where('ur.roleId = :roleId', { roleId })
          .getCount();
        if (administratorCount <= 1) {
          throw new ForbiddenException('Cannot remove the last administrator from the system');
        }
        const result = await manager.delete(UserRole, { userId, roleId, source: UserRoleSource.MANUAL });
        if (!result.affected) {
          throw new ConflictException(
            'Role is not manually assigned to this user and cannot be revoked via this endpoint',
          );
        }
      });
      this.permissionsCache.delete(userId);
      await this.permissionsChanged(userId);
      return;
    }

    const result = await this.userRoleRepository.delete({ userId, roleId, source: UserRoleSource.MANUAL });
    if (!result.affected) {
      throw new ConflictException('Role is not manually assigned to this user and cannot be revoked via this endpoint');
    }
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
  }

  /** Ceiling checks pass `includeUnavailable`: they must see dormant grants of unavailable plugin keys. */
  async getRoles(includeUnavailable = false): Promise<Role[]> {
    const roles = await this.roleRepository.find({ relations: { rolePermissions: true } });
    if (includeUnavailable) return roles;
    const unavailable = await this.getUnavailablePermissionKeys();
    return roles.map((role) => this.withoutUnavailable(role, unavailable));
  }

  async getRoleKey(roleId: number): Promise<string | null> {
    return (await this.roleRepository.findOne({ where: { id: roleId }, select: { key: true } }))?.key ?? null;
  }

  async getRolesWithUsage(): Promise<RoleWithUsageDto[]> {
    const roles = await this.roleRepository.find({
      relations: { rolePermissions: true },
      order: { isSystemManaged: 'DESC', name: 'ASC' },
    });
    const counts = await this.userRoleRepository
      .createQueryBuilder('ur')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .select('ur.roleId', 'roleId')
      .addSelect('COUNT(DISTINCT ur.userId)', 'userCount')
      .groupBy('ur.roleId')
      .getRawMany<{ roleId: number; userCount: string }>();
    const countByRoleId = new Map(counts.map((c) => [Number(c.roleId), Number(c.userCount)]));
    const unavailable = await this.getUnavailablePermissionKeys();
    return roles.map((role) =>
      Object.assign(new RoleWithUsageDto(), this.withoutUnavailable(role, unavailable), {
        userCount: countByRoleId.get(role.id) ?? 0,
      }),
    );
  }

  // only available keys can be granted; an unavailable plugin key is reported as unknown, like it looks to clients
  protected async resolvePermissionKeys(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    const found = await this.permissionRepository.find({ where: { key: In(unique), available: true } });
    if (found.length !== unique.length) {
      const known = new Set(found.map((p) => p.key));
      const unknown = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Unknown permission keys: ${unknown.join(', ')}`);
    }
    return unique;
  }

  // pass `manager` to count against uncommitted in-transaction state (permissions table itself is never
  // modified by role CRUD, so the total always comes from the plain repository)
  // Only available keys count: an unloaded plugin's keys grant nothing, so they cannot make anyone less of an admin.
  protected async countAdministratorEquivalentUsers(excludeRoleId?: number, manager?: EntityManager): Promise<number> {
    const totalPermissions = await this.permissionRepository.count({ where: { available: true } });
    if (totalPermissions === 0) return 0;
    const qb = (manager ? manager.createQueryBuilder(UserRole, 'ur') : this.userRoleRepository.createQueryBuilder('ur'))
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .innerJoin('role_permission', 'rp', 'rp.roleId = ur.roleId')
      .innerJoin('permission', 'p', 'p.key = rp.permissionKey AND p.available = 1')
      .select('ur.userId', 'userId')
      .groupBy('ur.userId')
      .having('COUNT(DISTINCT rp.permissionKey) = :totalPermissions', { totalPermissions });
    if (excludeRoleId !== undefined) {
      qb.where('ur.roleId != :excludeRoleId', { excludeRoleId });
    }
    const rows = await qb.getRawMany();
    return rows.length;
  }

  async getPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ where: { available: true }, order: { category: 'ASC', key: 'ASC' } });
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
    for (let suffix = 2; await this.roleRepository.existsBy({ key: candidate }); suffix++) {
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async createRole(dto: CreateRoleDto, actorPermissions: Set<string>, origin: AuditOrigin): Promise<Role> {
    const permissionKeys = await this.resolvePermissionKeys(dto.permissionKeys ?? []);
    this.assertActorHolds(actorPermissions, permissionKeys, 'grant');

    const role = await this.roleRepository.save(
      this.roleRepository.create({
        key: await this.generateRoleKey(dto.name),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        isSystemManaged: false,
        isDefault: false,
      }),
    );
    if (permissionKeys.length > 0) {
      await this.rolePermissionRepository.save(
        permissionKeys.map((permissionKey) => this.rolePermissionRepository.create({ roleId: role.id, permissionKey })),
      );
    }
    const created = await this.roleRepository.findOne({ where: { id: role.id }, relations: { rolePermissions: true } });
    await this.audit.record(roleAuditEvent('role_created', created as Role, origin));
    return created as Role;
  }

  async updateRole(
    roleId: number,
    dto: UpdateRoleDto,
    actorPermissions: Set<string>,
    origin: AuditOrigin,
  ): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id: roleId }, relations: { rolePermissions: true } });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    if (role.isSystemManaged) {
      throw new ForbiddenException('System-managed roles cannot be modified');
    }

    if (dto.name !== undefined) role.name = dto.name.trim();
    if (dto.description !== undefined) role.description = dto.description.trim();

    if (dto.permissionKeys !== undefined) {
      // Grants of unavailable plugin keys are invisible to the editor, so a full-set update must keep them.
      const hidden = await this.getUnavailablePermissionKeys();
      const keptHidden = role.rolePermissions.map((rp) => rp.permissionKey).filter((key) => hidden.has(key));
      const targetKeys = [
        ...(await this.resolvePermissionKeys(dto.permissionKeys.filter((key) => !keptHidden.includes(key)))),
        ...keptHidden,
      ];
      const currentKeys = new Set(role.rolePermissions.map((rp) => rp.permissionKey));
      const added = targetKeys.filter((k) => !currentKeys.has(k));
      const removed = [...currentKeys].filter((k) => !targetKeys.includes(k));
      this.assertActorHolds(actorPermissions, added, 'grant');
      this.assertActorHolds(actorPermissions, removed, 'revoke');

      await this.roleRepository.manager.transaction(async (manager) => {
        const adminsBefore = removed.length > 0 ? await this.countAdministratorEquivalentUsers(undefined, manager) : 0;
        await manager.save(Role, { id: role.id, name: role.name, description: role.description });
        if (removed.length > 0) {
          await manager.delete(RolePermission, { roleId: role.id, permissionKey: In(removed) });
        }
        for (const permissionKey of added) {
          await manager.save(RolePermission, manager.create(RolePermission, { roleId: role.id, permissionKey }));
        }
        // same lockout guard as deleteRole: a permission removal must not drop the
        // administrator-equivalent user count from >0 to 0 (rolls back via the thrown exception)
        if (adminsBefore > 0 && (await this.countAdministratorEquivalentUsers(undefined, manager)) === 0) {
          throw new ForbiddenException(
            'Updating this role would leave no active user with full administrative permissions',
          );
        }
      });
      // a role's permission set changed — every user holding it is affected
      this.permissionsCache.clear();
      await this.permissionsChanged();
    } else {
      await this.roleRepository.save({ id: role.id, name: role.name, description: role.description });
    }

    const updated = await this.roleRepository.findOne({ where: { id: roleId }, relations: { rolePermissions: true } });
    await this.audit.record(roleAuditEvent('role_updated', updated as Role, origin));
    return this.withoutUnavailable(updated as Role, await this.getUnavailablePermissionKeys());
  }

  async deleteRole(
    roleId: number,
    actorPermissions: Set<string>,
    origin: AuditOrigin,
    reassignToRoleId?: number,
  ): Promise<void> {
    const role = await this.roleRepository.findOne({ where: { id: roleId }, relations: { rolePermissions: true } });
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
      reassignTo = await this.roleRepository.findOne({
        where: { id: reassignToRoleId },
        relations: { rolePermissions: true },
      });
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

    await this.roleRepository.manager.transaction(async (manager) => {
      if (reassignTo) {
        const assignments = await manager.find(UserRole, { where: { roleId } });
        const affectedUserIds = [...new Set(assignments.map((a) => a.userId))];
        for (const userId of affectedUserIds) {
          const existing = await manager.findOne(UserRole, {
            where: { userId, roleId: reassignTo.id, source: UserRoleSource.MANUAL },
          });
          if (!existing) {
            await manager.save(
              UserRole,
              manager.create(UserRole, { userId, roleId: reassignTo.id, source: UserRoleSource.MANUAL }),
            );
          }
        }
      }
      // FK cascades remove role_permission and user_role rows
      await manager.delete(Role, { id: roleId });
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
