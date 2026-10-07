import { Permission, Role, RolePermission, User, UserRole } from '@attraccess/database-entities';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { EntityManager, Repository } from 'typeorm';
import { VALKEY_CLIENT } from '../../valkey/valkey.module';
import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
} from './authorization-cache-invalidation';
import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';
import { RbacSsoRoleSyncImplementation } from './rbac-sso-role-sync';

@Injectable()
export class RbacService extends RbacSsoRoleSyncImplementation {
  protected readonly logger = new Logger(RbacService.name);
  // ponytail: TTL cache — local invalidation keeps single-instance latency low; TTL bounds staleness
  // in multi-instance Postgres deployments where a role change on another instance won't invalidate here.
  protected readonly CACHE_TTL_MS = 30_000;
  protected readonly MAX_CACHE_SIZE = 1_000;
  protected readonly permissionsCache = new Map<number, { permissions: Set<string>; ts: number }>();

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
    @Optional() @Inject(VALKEY_CLIENT) protected readonly valkeyClient: Redis | null,
  ) {
    super();
  }

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

  // pass `manager` to count against uncommitted in-transaction state (permissions table itself is never
  // modified by role CRUD, so the total always comes from the plain repository)

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
}
