import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { Permission, Role, RolePermission, User, UserRole, UserRoleSource, UserType } from '@attraccess/database-entities';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RoleWithUsageDto } from './dtos/role-with-usage.dto';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  // ponytail: TTL cache — local invalidation keeps single-instance latency low; TTL bounds staleness
  // in multi-instance Postgres deployments where a role change on another instance won't invalidate here.
  private readonly CACHE_TTL_MS = 30_000;
  private readonly MAX_CACHE_SIZE = 1_000;
  private readonly permissionsCache = new Map<number, { permissions: Set<string>; ts: number }>();

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
  ) {}

  async getEffectivePermissions(userId: number): Promise<Set<string>> {
    const entry = this.permissionsCache.get(userId);
    if (entry && Date.now() - entry.ts < this.CACHE_TTL_MS) return new Set(entry.permissions);

    const rows = await this.userRoleRepository
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .select('rp.permissionKey', 'permissionKey')
      .distinct(true)
      .where('ur.userId = :userId', { userId })
      .getRawMany<{ permissionKey: string }>();

    const permissions = new Set(rows.map((r) => r.permissionKey));
    // FIFO eviction: drop the oldest entry when the cache is full
    if (this.permissionsCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.permissionsCache.keys().next().value;
      this.permissionsCache.delete(oldestKey);
    }
    this.permissionsCache.set(userId, { permissions, ts: Date.now() });
    return new Set(permissions);
  }

  async getRoles(): Promise<Role[]> {
    return this.roleRepository.find({ relations: ['rolePermissions'] });
  }

  async getRolesWithUsage(): Promise<RoleWithUsageDto[]> {
    const roles = await this.roleRepository.find({
      relations: ['rolePermissions'],
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
    return roles.map((role) => Object.assign(new RoleWithUsageDto(), role, { userCount: countByRoleId.get(role.id) ?? 0 }));
  }

  private async resolvePermissionKeys(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    const found = await this.permissionRepository.find({ where: { key: In(unique) } });
    if (found.length !== unique.length) {
      const known = new Set(found.map((p) => p.key));
      const unknown = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Unknown permission keys: ${unknown.join(', ')}`);
    }
    return unique;
  }

  private assertActorHolds(actorPermissions: Set<string>, keys: string[], action: 'grant' | 'revoke'): void {
    const missing = keys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException(`You cannot ${action} permissions you do not have: ${missing.join(', ')}`);
    }
  }

  private assertNotGuest(user: User): void {
    if (user.userType === UserType.GUEST) {
      throw new BadRequestException('Roles cannot be assigned to guest accounts');
    }
  }

  private async loadUserForGuard(userId: number, em?: EntityManager): Promise<User | null> {
    const repo = em ? em.getRepository(User) : this.userRepository;
    return repo.findOne({ where: { id: userId } });
  }

  private async generateRoleKey(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'role';
    let candidate = base;
    for (let suffix = 2; await this.roleRepository.existsBy({ key: candidate }); suffix++) {
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async createRole(dto: CreateRoleDto, actorPermissions: Set<string>): Promise<Role> {
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
    const created = await this.roleRepository.findOne({ where: { id: role.id }, relations: ['rolePermissions'] });
    return created as Role;
  }

  async updateRole(roleId: number, dto: UpdateRoleDto, actorPermissions: Set<string>): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id: roleId }, relations: ['rolePermissions'] });
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
    } else {
      await this.roleRepository.save({ id: role.id, name: role.name, description: role.description });
    }

    const updated = await this.roleRepository.findOne({ where: { id: roleId }, relations: ['rolePermissions'] });
    return updated as Role;
  }

  // pass `manager` to count against uncommitted in-transaction state (permissions table itself is never
  // modified by role CRUD, so the total always comes from the plain repository)
  private async countAdministratorEquivalentUsers(excludeRoleId?: number, manager?: EntityManager): Promise<number> {
    const totalPermissions = await this.permissionRepository.count();
    if (totalPermissions === 0) return 0;
    const qb = (manager ? manager.createQueryBuilder(UserRole, 'ur') : this.userRoleRepository.createQueryBuilder('ur'))
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .innerJoin('role_permission', 'rp', 'rp.roleId = ur.roleId')
      .select('ur.userId', 'userId')
      .groupBy('ur.userId')
      .having('COUNT(DISTINCT rp.permissionKey) = :totalPermissions', { totalPermissions });
    if (excludeRoleId !== undefined) {
      qb.where('ur.roleId != :excludeRoleId', { excludeRoleId });
    }
    const rows = await qb.getRawMany();
    return rows.length;
  }

  async deleteRole(roleId: number, actorPermissions: Set<string>, reassignToRoleId?: number): Promise<void> {
    const role = await this.roleRepository.findOne({ where: { id: roleId }, relations: ['rolePermissions'] });
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
        relations: ['rolePermissions'],
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
      throw new ForbiddenException('Deleting this role would leave no active user with full administrative permissions');
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
  }

  async getPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ order: { category: 'ASC', key: 'ASC' } });
  }

  async getUserRoles(userId: number): Promise<UserRole[]> {
    return this.userRoleRepository.find({
      where: { userId },
      relations: ['role'],
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
      .select('DISTINCT ur.userId', 'userId')
      .where('rp.permissionKey = :permKey', { permKey: permissionKey })
      .getRawMany<{ userId: number }>();
    return rows.map((r) => r.userId);
  }

  async assignRoleByKey(userId: number, roleKey: string, em?: EntityManager): Promise<UserRole | null> {
    const roleRepo = em ? em.getRepository(Role) : this.roleRepository;
    const urRepo = em ? em.getRepository(UserRole) : this.userRoleRepository;

    const user = await this.loadUserForGuard(userId, em);
    if (user) this.assertNotGuest(user);

    const role = await roleRepo.findOne({ where: { key: roleKey } });
    if (!role) return null;
    const existing = await urRepo.findOne({
      where: { userId, roleId: role.id, source: UserRoleSource.MANUAL },
    });
    if (existing) return existing;
    const result = await urRepo.save(
      urRepo.create({ userId, roleId: role.id, source: UserRoleSource.MANUAL }),
    );
    this.permissionsCache.delete(userId);
    return result;
  }

  async assignDefaultRoles(userId: number, em?: EntityManager): Promise<void> {
    const roleRepo = em ? em.getRepository(Role) : this.roleRepository;
    const urRepo = em ? em.getRepository(UserRole) : this.userRoleRepository;

    // Guests hold zero roles by design — never grant them the default roles.
    const user = await this.loadUserForGuard(userId, em);
    if (user?.userType === UserType.GUEST) return;

    const defaultRoles = await roleRepo.find({ where: { isDefault: true } });
    for (const role of defaultRoles) {
      const existing = await urRepo.findOne({
        where: { userId, roleId: role.id, source: UserRoleSource.MANUAL },
      });
      if (!existing) {
        await urRepo.save(urRepo.create({ userId, roleId: role.id, source: UserRoleSource.MANUAL }));
      }
    }
    this.permissionsCache.delete(userId);
  }

  async assignRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<UserRole> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UserNotFoundException(userId);
    this.assertNotGuest(user);

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['rolePermissions'],
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // cannot-grant-what-you-don't-have: actor must hold every permission the role grants
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
    return saved;
  }

  async revokeRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<void> {
    const userExists = await this.userRepository.existsBy({ id: userId });
    if (!userExists) throw new UserNotFoundException(userId);

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['rolePermissions'],
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
          throw new ConflictException('Role is not manually assigned to this user and cannot be revoked via this endpoint');
        }
      });
      this.permissionsCache.delete(userId);
      return;
    }

    const result = await this.userRoleRepository.delete({ userId, roleId, source: UserRoleSource.MANUAL });
    if (!result.affected) {
      throw new ConflictException('Role is not manually assigned to this user and cannot be revoked via this endpoint');
    }
    this.permissionsCache.delete(userId);
  }

  async syncSsoRoles(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
  ): Promise<void> {
    // Guests never authenticate via SSO and must never hold roles.
    const user = await this.loadUserForGuard(userId);
    if (user?.userType === UserType.GUEST) return;

    // roleKey -> external claim value that granted it (source metadata for the UI)
    const targetByKey = new Map(roles.map((r) => [r.roleKey, r.externalValue ?? null]));

    const currentSsoRoles = await this.userRoleRepository.find({
      where: { userId, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      relations: ['role'],
    });

    for (const ur of currentSsoRoles) {
      if (!targetByKey.has(ur.role.key)) {
        // ponytail: last-administrator guardrail — transient IdP claim omission must not silently strip the last administrator
        if (ur.role.key === 'administrator') {
          const otherAdministratorCount = await this.userRoleRepository
            .createQueryBuilder('ur2')
            .innerJoin('ur2.user', 'u', 'u.deletedAt IS NULL')
            .where('ur2.roleId = :roleId', { roleId: ur.roleId })
            .andWhere('ur2.id != :id', { id: ur.id })
            .getCount();
          if (otherAdministratorCount === 0) {
            continue;
          }
        }
        await this.userRoleRepository.delete({ id: ur.id });
      }
    }

    const currentByKey = new Map(currentSsoRoles.map((ur) => [ur.role.key, ur]));
    for (const [roleKey, externalValue] of targetByKey) {
      const current = currentByKey.get(roleKey);
      if (current) {
        if ((current.externalValue ?? null) !== externalValue) {
          await this.userRoleRepository.update({ id: current.id }, { externalValue });
        }
        continue;
      }
      const role = await this.roleRepository.findOne({ where: { key: roleKey } });
      if (!role) continue;
      const existing = await this.userRoleRepository.findOne({
        where: { userId, roleId: role.id, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      });
      if (!existing) {
        try {
          await this.userRoleRepository.save(
            this.userRoleRepository.create({
              userId,
              roleId: role.id,
              source: UserRoleSource.SSO,
              ssoProviderType,
              ssoProviderId,
              externalValue,
            }),
          );
        } catch (err) {
          // ponytail: '23505' = Postgres unique; SQLite reuses SQLITE_CONSTRAINT for FK/CHECK/NOT NULL too, so narrow by message
          const code = (err as QueryFailedError & { code?: string }).code;
          const isUniqueViolation =
            err instanceof QueryFailedError &&
            (code === '23505' || (code === 'SQLITE_CONSTRAINT' && err.message.includes('UNIQUE constraint failed')));
          if (isUniqueViolation) {
            // Another SSO provider already granted this role — unique(userId, roleId, source) violated; ignore
            this.logger.debug(`syncSsoRoles: role ${roleKey} already held via another provider for user ${userId}`);
          } else {
            throw err;
          }
        }
      }
    }
    this.permissionsCache.delete(userId);
  }
}
