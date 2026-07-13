import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Permission, Role, UserRole, UserRoleSource } from '@attraccess/database-entities';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async getEffectivePermissions(userId: number): Promise<Set<string>> {
    const userRoles = await this.userRoleRepository.find({
      where: { userId },
      relations: ['role', 'role.rolePermissions'],
    });

    const permissions = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role?.rolePermissions ?? []) {
        permissions.add(rp.permissionKey);
      }
    }
    return permissions;
  }

  async getRoles(): Promise<Role[]> {
    return this.roleRepository.find({ relations: ['rolePermissions'] });
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

  async assignRoleByKey(userId: number, roleKey: string): Promise<UserRole | null> {
    const role = await this.roleRepository.findOne({ where: { key: roleKey } });
    if (!role) return null;
    const existing = await this.userRoleRepository.findOne({
      where: { userId, roleId: role.id, source: UserRoleSource.MANUAL },
    });
    if (existing) return existing;
    return this.userRoleRepository.save(
      this.userRoleRepository.create({ userId, roleId: role.id, source: UserRoleSource.MANUAL }),
    );
  }

  async assignDefaultRoles(userId: number): Promise<void> {
    const defaultRoles = await this.roleRepository.find({ where: { isDefault: true } });
    for (const role of defaultRoles) {
      const existing = await this.userRoleRepository.findOne({
        where: { userId, roleId: role.id, source: UserRoleSource.MANUAL },
      });
      if (!existing) {
        await this.userRoleRepository.save(
          this.userRoleRepository.create({ userId, roleId: role.id, source: UserRoleSource.MANUAL }),
        );
      }
    }
  }

  async assignRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<UserRole> {
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
    return this.userRoleRepository.save(userRole);
  }

  async revokeRole(userId: number, roleId: number, actorPermissions: Set<string>): Promise<void> {
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

    // last-owner guardrail: don't let the last non-deleted owner lose the owner role
    // Count ALL owner assignments regardless of source (MANUAL or SSO) so that SSO-provisioned
    // owners are not invisible to this check.
    if (role.key === 'owner') {
      const ownerCount = await this.userRoleRepository
        .createQueryBuilder('ur')
        .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
        .where('ur.roleId = :roleId', { roleId })
        .getCount();
      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot remove the last owner from the system');
      }
    }

    const result = await this.userRoleRepository.delete({ userId, roleId, source: UserRoleSource.MANUAL });
    if (!result.affected) {
      throw new ConflictException('Role is not manually assigned to this user and cannot be revoked via this endpoint');
    }
  }

  async syncSsoRoles(
    userId: number,
    roleKeys: string[],
    ssoProviderType: string,
    ssoProviderId: number,
  ): Promise<void> {
    const targetRoleKeys = new Set(roleKeys);

    const currentSsoRoles = await this.userRoleRepository.find({
      where: { userId, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      relations: ['role'],
    });

    for (const ur of currentSsoRoles) {
      if (!targetRoleKeys.has(ur.role.key)) {
        // ponytail: last-owner guardrail — transient IdP claim omission must not silently strip the last owner
        if (ur.role.key === 'owner') {
          const otherOwnerCount = await this.userRoleRepository
            .createQueryBuilder('ur2')
            .innerJoin('ur2.user', 'u', 'u.deletedAt IS NULL')
            .where('ur2.roleId = :roleId', { roleId: ur.roleId })
            .andWhere('ur2.id != :id', { id: ur.id })
            .getCount();
          if (otherOwnerCount === 0) {
            continue;
          }
        }
        await this.userRoleRepository.delete({ id: ur.id });
      }
    }

    const currentRoleKeys = new Set(currentSsoRoles.map((ur) => ur.role.key));
    for (const roleKey of targetRoleKeys) {
      if (currentRoleKeys.has(roleKey)) continue;
      const role = await this.roleRepository.findOne({ where: { key: roleKey } });
      if (!role) continue;
      const existing = await this.userRoleRepository.findOne({
        where: { userId, roleId: role.id, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      });
      if (!existing) {
        try {
          await this.userRoleRepository.save(
            this.userRoleRepository.create({ userId, roleId: role.id, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId }),
          );
        } catch (err) {
          // ponytail: '23505' = Postgres unique violation; 'SQLITE_CONSTRAINT' = SQLite equivalent
          const code = (err as QueryFailedError & { code?: string }).code;
          if (err instanceof QueryFailedError && (code === '23505' || code === 'SQLITE_CONSTRAINT')) {
            // Another SSO provider already granted this role — unique(userId, roleId, source) violated; ignore
            this.logger.debug(`syncSsoRoles: role ${roleKey} already held via another provider for user ${userId}`);
          } else {
            throw err;
          }
        }
      }
    }
  }
}
