import { Role, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { RbacRoleQueriesImplementation } from './rbac-role-queries';
export abstract class RbacRoleAssignmentImplementation extends RbacRoleQueriesImplementation {
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
    await this.permissionsChanged(userId);
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
}
