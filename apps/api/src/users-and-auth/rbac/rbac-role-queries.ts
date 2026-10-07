import { Permission, Role, UserRole } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { RoleWithUsageDto } from './dtos/role-with-usage.dto';
import { RbacRoleWritingImplementation } from './rbac-role-writing';
export abstract class RbacRoleQueriesImplementation extends RbacRoleWritingImplementation {
  async getRoles(): Promise<Role[]> {
    return this.roleRepository.find({ relations: ['rolePermissions'] });
  }

  async getRoleKey(roleId: number): Promise<string | null> {
    return (await this.roleRepository.findOne({ where: { id: roleId }, select: { key: true } }))?.key ?? null;
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
    return roles.map((role) =>
      Object.assign(new RoleWithUsageDto(), role, { userCount: countByRoleId.get(role.id) ?? 0 }),
    );
  }

  protected async resolvePermissionKeys(keys: string[]): Promise<string[]> {
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

  // pass `manager` to count against uncommitted in-transaction state (permissions table itself is never
  // modified by role CRUD, so the total always comes from the plain repository)
  protected async countAdministratorEquivalentUsers(excludeRoleId?: number, manager?: EntityManager): Promise<number> {
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

  async getPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({ order: { category: 'ASC', key: 'ASC' } });
  }
}
