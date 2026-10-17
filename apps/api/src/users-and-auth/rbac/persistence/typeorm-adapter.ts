import { Permission, Role, RolePermission, User, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { NewRole, NewRoleGrant, RbacPersistence, RoleGrantConflictError, RoleGrantIdentity } from './port';

@Injectable()
export class TypeormRbacPersistence extends RbacPersistence {
  constructor(
    @InjectRepository(UserRole) private readonly assignments: Repository<UserRole>,
    @InjectRepository(Role) private readonly roleRows: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRows: Repository<Permission>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RolePermission) private readonly rolePermissions: Repository<RolePermission>,
    private readonly transaction?: EntityManager,
  ) {
    super();
  }

  async effectivePermissionKeys(userId: number): Promise<string[]> {
    const rows = await this.assignments
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .select('rp.permissionKey', 'permissionKey')
      .distinct(true)
      .where('ur.userId = :userId', { userId })
      .getRawMany<{ permissionKey: string }>();
    return rows.map(({ permissionKey }) => permissionKey);
  }
  async userRoles(userId: number): Promise<UserRole[]> {
    return toApplicationRecord(await this.assignments.find({ where: { userId }, relations: ['role'] }));
  }
  async roleByKey(key: string): Promise<Role | null> {
    return toApplicationRecord(await this.roleRows.findOne({ where: { key } }));
  }
  async roleById(id: number): Promise<Role | null> {
    return toApplicationRecord(await this.roleRows.findOne({ where: { id }, relations: ['rolePermissions'] }));
  }
  async grant(identity: RoleGrantIdentity): Promise<UserRole | null> {
    return toApplicationRecord(
      await (this.transaction && identity.source === UserRoleSource.MANUAL
        ? this.transaction.findOne(UserRole, { where: identity })
        : this.assignments.findOne({ where: identity })),
    );
  }
  async ssoGrants(userId: number, providerType: string, providerId: number): Promise<UserRole[]> {
    return toApplicationRecord(
      await this.assignments.find({
        where: {
          userId,
          source: UserRoleSource.SSO,
          ssoProviderType: providerType,
          ssoProviderId: providerId,
        },
        relations: ['role'],
      }),
    );
  }
  async roleAssignments(roleId: number): Promise<UserRole[]> {
    return toApplicationRecord(
      await (this.transaction
        ? this.transaction.find(UserRole, { where: { roleId } })
        : this.assignments.find({ where: { roleId } })),
    );
  }
  async administratorGrantCount(roleId: number, excludeUserId?: number, excludeGrantId?: number): Promise<number> {
    const alias = excludeGrantId === undefined ? 'ur' : 'ur2';
    const query = (
      this.transaction && excludeGrantId === undefined
        ? this.transaction.createQueryBuilder(UserRole, alias)
        : this.assignments.createQueryBuilder(alias)
    )
      .innerJoin(`${alias}.user`, 'u', 'u.deletedAt IS NULL')
      .where(`${alias}.roleId = :roleId`, { roleId });
    if (excludeUserId !== undefined) query.andWhere(`${alias}.userId != :userId`, { userId: excludeUserId });
    if (excludeGrantId !== undefined) query.andWhere(`${alias}.id != :id`, { id: excludeGrantId });
    return query.getCount();
  }
  async userIdsWithPermission(key: string): Promise<number[]> {
    const rows = await this.assignments
      .createQueryBuilder('ur')
      .innerJoin('role_permission', 'rp', 'rp.roleId = ur.roleId')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .select('DISTINCT ur.userId', 'userId')
      .where('rp.permissionKey = :permKey', { permKey: key })
      .getRawMany<{ userId: number }>();
    return rows.map(({ userId }) => userId);
  }
  async createGrant(input: NewRoleGrant): Promise<UserRole> {
    try {
      return toApplicationRecord(
        await (this.transaction && input.source === UserRoleSource.MANUAL
          ? this.transaction.save(UserRole, this.transaction.create(UserRole, input))
          : this.assignments.save(this.assignments.create(input))),
      );
    } catch (error) {
      const code = (error as QueryFailedError & { code?: string }).code;
      if (
        error instanceof QueryFailedError &&
        (code === '23505' || (code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed')))
      ) {
        throw new RoleGrantConflictError(error.message);
      }
      throw error;
    }
  }
  async removeGrant(id: number): Promise<void> {
    await this.assignments.delete({ id });
  }
  async removeManualGrant(userId: number, roleId: number): Promise<boolean> {
    const identity = { userId, roleId, source: UserRoleSource.MANUAL };
    return !!(
      await (this.transaction ? this.transaction.delete(UserRole, identity) : this.assignments.delete(identity))
    ).affected;
  }
  async updateExternalValue(id: number, externalValue: string | null): Promise<void> {
    await this.assignments.update({ id }, { externalValue });
  }
  async defaultRoles(): Promise<Role[]> {
    return toApplicationRecord(await this.roleRows.find({ where: { isDefault: true } }));
  }
  async userExists(userId: number): Promise<boolean> {
    return this.users.existsBy({ id: userId });
  }
  async roles(ordered = false): Promise<Role[]> {
    return toApplicationRecord(
      await this.roleRows.find({
        relations: ['rolePermissions'],
        ...(ordered ? { order: { isSystemManaged: 'DESC' as const, name: 'ASC' as const } } : {}),
      }),
    );
  }
  async roleKey(id: number): Promise<string | null> {
    return (await this.roleRows.findOne({ where: { id }, select: { key: true } }))?.key ?? null;
  }
  async roleUserCounts(): Promise<Array<{ roleId: number; userCount: number }>> {
    const rows = await this.assignments
      .createQueryBuilder('ur')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .select('ur.roleId', 'roleId')
      .addSelect('COUNT(DISTINCT ur.userId)', 'userCount')
      .groupBy('ur.roleId')
      .getRawMany<{ roleId: number; userCount: string }>();
    return rows.map(({ roleId, userCount }) => ({ roleId: Number(roleId), userCount: Number(userCount) }));
  }
  async permissionsByKeys(keys: readonly string[]): Promise<Permission[]> {
    return toApplicationRecord(await this.permissionRows.find({ where: { key: In([...keys]) } }));
  }
  async permissionCount(): Promise<number> {
    return this.permissionRows.count();
  }
  async fullPermissionHolderCount(totalPermissions: number, excludeRoleId?: number): Promise<number> {
    const query = (
      this.transaction ? this.transaction.createQueryBuilder(UserRole, 'ur') : this.assignments.createQueryBuilder('ur')
    )
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .innerJoin('role_permission', 'rp', 'rp.roleId = ur.roleId')
      .select('ur.userId', 'userId')
      .groupBy('ur.userId')
      .having('COUNT(DISTINCT rp.permissionKey) = :totalPermissions', { totalPermissions });
    if (excludeRoleId !== undefined) query.where('ur.roleId != :excludeRoleId', { excludeRoleId });
    return (await query.getRawMany()).length;
  }
  async permissions(): Promise<Permission[]> {
    return toApplicationRecord(await this.permissionRows.find({ order: { category: 'ASC', key: 'ASC' } }));
  }
  async roleKeyExists(key: string): Promise<boolean> {
    return this.roleRows.existsBy({ key });
  }
  async createRole(input: NewRole): Promise<Role> {
    return toApplicationRecord(await this.roleRows.save(this.roleRows.create(input)));
  }
  async addPermissions(roleId: number, keys: readonly string[]): Promise<void> {
    await this.rolePermissions.save(
      keys.map((permissionKey) => this.rolePermissions.create({ roleId, permissionKey })),
    );
  }
  async saveRoleFields(id: number, name: string, description: string): Promise<void> {
    if (this.transaction) await this.transaction.save(Role, { id, name, description });
    else await this.roleRows.save({ id, name, description });
  }
  async removePermissions(roleId: number, keys: readonly string[]): Promise<void> {
    const identity = { roleId, permissionKey: In([...keys]) };
    if (this.transaction) await this.transaction.delete(RolePermission, identity);
    else await this.rolePermissions.delete(identity);
  }
  async addPermission(roleId: number, permissionKey: string): Promise<void> {
    if (this.transaction)
      await this.transaction.save(RolePermission, this.transaction.create(RolePermission, { roleId, permissionKey }));
    else await this.rolePermissions.save(this.rolePermissions.create({ roleId, permissionKey }));
  }
  async removeRole(id: number): Promise<void> {
    if (this.transaction) await this.transaction.delete(Role, { id });
    else await this.roleRows.delete({ id });
  }
}

export function rbacTransactionOperations(manager: EntityManager): TypeormRbacPersistence {
  return new TypeormRbacPersistence(
    manager.getRepository(UserRole),
    manager.getRepository(Role),
    manager.getRepository(Permission),
    manager.getRepository(User),
    manager.getRepository(RolePermission),
    manager,
  );
}
