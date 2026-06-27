import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission, Role, UserRole, UserRoleSource } from '@attraccess/database-entities';

@Injectable()
export class RbacService {
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

  async revokeRole(userId: number, roleId: number): Promise<void> {
    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    // last-owner guardrail: don't let the last owner lose the owner role
    if (role.key === 'owner') {
      const ownerCount = await this.userRoleRepository.count({
        where: { roleId, source: UserRoleSource.MANUAL },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot remove the last owner from the system');
      }
    }

    await this.userRoleRepository.delete({ userId, roleId, source: UserRoleSource.MANUAL });
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
        await this.userRoleRepository.save(
          this.userRoleRepository.create({ userId, roleId: role.id, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId }),
        );
      }
    }
  }
}
