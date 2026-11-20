import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  UserRoleSource,
  type PermissionRecord,
  type RoleRecord,
  type RoleWithUserCount,
  type SsoRoleAssignmentTarget,
  type SsoRoleChanges,
  type UserRoleRecord,
} from '@attraccess/application-models';
import { Permission, Role, RolePermission, User, UserRole } from '@attraccess/database-entities';
import { DataSource, EntityManager, In } from 'typeorm';
import type { RbacStore } from '../../../users-and-auth/rbac/rbac.port';
import type { TransactionContext } from '../../transaction-context';
import { TransactionContextResolver } from '../transaction-context';
import { findRelations } from '../find-options';

const toRolePermission = (rp: RolePermission) => ({
  id: rp.id,
  roleId: rp.roleId,
  permissionKey: rp.permissionKey,
  createdAt: rp.createdAt,
});

export function toRoleRecord(role: Role): RoleRecord {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystemManaged: role.isSystemManaged,
    isDefault: role.isDefault,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    ...(role.rolePermissions ? { rolePermissions: role.rolePermissions.map(toRolePermission) } : {}),
  };
}

export function toUserRoleRecord(userRole: UserRole): UserRoleRecord {
  return {
    id: userRole.id,
    userId: userRole.userId,
    roleId: userRole.roleId,
    source: userRole.source,
    ssoProviderType: userRole.ssoProviderType ?? null,
    ssoProviderId: userRole.ssoProviderId ?? null,
    externalValue: userRole.externalValue ?? null,
    createdAt: userRole.createdAt,
    updatedAt: userRole.updatedAt,
    ...(userRole.role ? { role: toRoleRecord(userRole.role) } : {}),
  };
}

const toPermissionRecord = (permission: Permission): PermissionRecord => ({
  key: permission.key,
  label: permission.label,
  description: permission.description,
  category: permission.category,
  pluginName: permission.pluginName ?? null,
  labelDe: permission.labelDe ?? null,
  descriptionDe: permission.descriptionDe ?? null,
  categoryLabel: permission.categoryLabel ?? null,
  categoryLabelDe: permission.categoryLabelDe ?? null,
  available: permission.available ?? true,
  createdAt: permission.createdAt,
  updatedAt: permission.updatedAt,
});

/** Advisory lock key of the "never leave the system without an administrator" guards. */
const ADMINISTRATOR_GUARD_LOCK = 584_101;

@Injectable()
export class TypeOrmRbacStore implements RbacStore {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    private readonly tx: TransactionContextResolver,
  ) {}

  private manager(context?: TransactionContext): EntityManager {
    return this.tx.manager(context);
  }

  permissionKeysOf(userId: number): Promise<string[]> {
    return this.rolePermissionKeysOf(userId, true);
  }

  dormantPermissionKeysOf(userId: number): Promise<string[]> {
    return this.rolePermissionKeysOf(userId, false);
  }

  private async rolePermissionKeysOf(userId: number, available: boolean): Promise<string[]> {
    const rows = await this.source
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'p', 'p.available = :available', { available })
      .select('rp.permissionKey', 'permissionKey')
      .distinct(true)
      .where('ur.userId = :userId', { userId })
      .getRawMany<{ permissionKey: string }>();
    return rows.map((r) => r.permissionKey);
  }

  async userIdsWithPermission(permissionKey: string): Promise<number[]> {
    const rows = await this.source
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin('role_permission', 'rp', '"rp"."roleId" = ur."roleId"')
      // Soft-deleted users keep their user_role rows (anonymizeAndSoftDelete only drops auth
      // details and sessions), so without this a deleted admin still counts as a permission
      // holder forever — e.g. as a supervisor who provably cannot supervise (ATT-867).
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .innerJoin('permission', 'p', '"p"."key" = "rp"."permissionKey" AND "p"."available" = true')
      .select('DISTINCT ur.userId', 'userId')
      .where('rp.permissionKey = :permKey', { permKey: permissionKey })
      .getRawMany<{ userId: number }>();
    return rows.map((r) => r.userId);
  }

  async findUserRoles(userId: number): Promise<UserRoleRecord[]> {
    const rows = await this.source.getRepository(UserRole).find({ where: { userId }, relations: { role: true } });
    return rows.map(toUserRoleRecord);
  }

  async userExists(userId: number): Promise<boolean> {
    return this.source.getRepository(User).existsBy({ id: userId });
  }

  async findRoleByKey(
    key: string,
    context?: TransactionContext,
    options: { withPermissions?: boolean } = {},
  ): Promise<RoleRecord | null> {
    const role = await this.manager(context)
      .getRepository(Role)
      .findOne({
        where: { key },
        relations: findRelations(options.withPermissions ? ['rolePermissions'] : []),
      });
    return role ? toRoleRecord(role) : null;
  }

  async findRoleById(roleId: number, context?: TransactionContext): Promise<RoleRecord | null> {
    const role = await this.manager(context)
      .getRepository(Role)
      .findOne({
        where: { id: roleId },
        relations: { rolePermissions: true },
      });
    return role ? toRoleRecord(role) : null;
  }

  async findDefaultRoles(context?: TransactionContext): Promise<RoleRecord[]> {
    const roles = await this.manager(context)
      .getRepository(Role)
      .find({ where: { isDefault: true } });
    return roles.map(toRoleRecord);
  }

  async roleKeyOf(roleId: number): Promise<string | null> {
    const role = await this.source.getRepository(Role).findOne({ where: { id: roleId }, select: { key: true } });
    return role?.key ?? null;
  }

  async findManualAssignment(
    userId: number,
    roleId: number,
    context?: TransactionContext,
  ): Promise<UserRoleRecord | null> {
    const row = await this.manager(context)
      .getRepository(UserRole)
      .findOne({ where: { userId, roleId, source: UserRoleSource.MANUAL } });
    return row ? toUserRoleRecord(row) : null;
  }

  async addManualAssignment(userId: number, roleId: number, context?: TransactionContext): Promise<UserRoleRecord> {
    const repo = this.manager(context).getRepository(UserRole);
    return toUserRoleRecord(await repo.save(repo.create({ userId, roleId, source: UserRoleSource.MANUAL })));
  }

  async revokeManualAssignment(userId: number, roleId: number, context?: TransactionContext): Promise<boolean> {
    const result = await this.manager(context)
      .getRepository(UserRole)
      .delete({ userId, roleId, source: UserRoleSource.MANUAL });
    return !!result.affected;
  }

  /**
   * The guards below count administrators and the caller then removes one. Under READ COMMITTED two transactions
   * could both count two and both remove, so inside a transaction the guards queue on one advisory lock that is held
   * until that transaction ends; the second one then counts the committed result of the first.
   */
  private async lockAdministratorGuard(context?: TransactionContext): Promise<void> {
    if (context) await this.manager(context).query('SELECT pg_advisory_xact_lock($1)', [ADMINISTRATOR_GUARD_LOCK]);
  }

  async isLastAdministrator(userId: number, context?: TransactionContext): Promise<boolean> {
    await this.lockAdministratorGuard(context);
    const manager = this.manager(context);
    const administratorRole = await manager.getRepository(Role).findOne({ where: { key: 'administrator' } });
    if (!administratorRole) return false;
    const isAdministrator = await manager
      .getRepository(UserRole)
      .findOne({ where: { userId, roleId: administratorRole.id } });
    if (!isAdministrator) return false;
    const otherAdministratorCount = await manager
      .createQueryBuilder(UserRole, 'ur')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .where('ur.roleId = :roleId', { roleId: administratorRole.id })
      .andWhere('ur.userId != :userId', { userId })
      .getCount();
    return otherAdministratorCount === 0;
  }

  async countActiveRoleHolders(roleId: number, context?: TransactionContext): Promise<number> {
    await this.lockAdministratorGuard(context);
    return this.manager(context)
      .createQueryBuilder(UserRole, 'ur')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .where('ur.roleId = :roleId', { roleId })
      .getCount();
  }

  async countAdministratorEquivalentUsers(excludeRoleId?: number, context?: TransactionContext): Promise<number> {
    // the permissions table itself is never modified by role CRUD, so the total always comes from the plain connection.
    // Only available keys count: an unloaded plugin's keys grant nothing, so they cannot make anyone less of an admin.
    await this.lockAdministratorGuard(context);
    const totalPermissions = await this.source.getRepository(Permission).count({ where: { available: true } });
    if (totalPermissions === 0) return 0;
    const qb = this.manager(context)
      .createQueryBuilder(UserRole, 'ur')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .innerJoin('role_permission', 'rp', '"rp"."roleId" = ur."roleId"')
      .innerJoin('permission', 'p', '"p"."key" = "rp"."permissionKey" AND "p"."available" = true')
      .select('ur.userId', 'userId')
      .groupBy('ur.userId')
      .having('COUNT(DISTINCT rp.permissionKey) = :totalPermissions', { totalPermissions });
    if (excludeRoleId !== undefined) {
      qb.where('ur.roleId != :excludeRoleId', { excludeRoleId });
    }
    return (await qb.getRawMany()).length;
  }

  async syncSsoAssignments(
    userId: number,
    targets: SsoRoleAssignmentTarget[],
    ssoProviderType: string,
    ssoProviderId: number,
    context: TransactionContext,
  ): Promise<SsoRoleChanges> {
    const manager = this.manager(context);
    const userRoleRepository = manager.getRepository(UserRole);
    const roleRepository = manager.getRepository(Role);
    // roleKey -> external claim value that granted it (source metadata for the UI)
    const targetByKey = new Map(targets.map((r) => [r.roleKey, r.externalValue ?? null]));

    const currentSsoRoles = await userRoleRepository.find({
      where: { userId, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      relations: { role: true },
    });
    const removed: string[] = [];
    const added: string[] = [];
    const updated: string[] = [];

    for (const ur of currentSsoRoles) {
      if (!targetByKey.has(ur.role.key)) {
        // ponytail: last-administrator guardrail — transient IdP claim omission must not silently strip the last administrator
        if (ur.role.key === 'administrator') {
          await this.lockAdministratorGuard(context);
          const otherAdministratorCount = await userRoleRepository
            .createQueryBuilder('ur2')
            .innerJoin('ur2.user', 'u', 'u.deletedAt IS NULL')
            .where('ur2.roleId = :roleId', { roleId: ur.roleId })
            .andWhere('ur2.id != :id', { id: ur.id })
            .getCount();
          if (otherAdministratorCount === 0) {
            continue;
          }
        }
        await userRoleRepository.delete({ id: ur.id });
        removed.push(ur.role.key);
      }
    }

    const currentByKey = new Map(currentSsoRoles.map((ur) => [ur.role.key, ur]));
    for (const [roleKey, externalValue] of targetByKey) {
      const current = currentByKey.get(roleKey);
      if (current) {
        if ((current.externalValue ?? null) !== externalValue) {
          await userRoleRepository.update({ id: current.id }, { externalValue });
          updated.push(roleKey);
        }
        continue;
      }
      const role = await roleRepository.findOne({ where: { key: roleKey } });
      if (!role) continue;
      const existing = await userRoleRepository.findOne({
        where: { userId, roleId: role.id, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      });
      if (existing) continue;
      // ON CONFLICT DO NOTHING instead of catching a unique violation: in PostgreSQL a failed statement would abort the
      // whole transaction. Another SSO provider may already have granted this role (unique(userId, roleId, source)).
      const inserted = await userRoleRepository
        .createQueryBuilder()
        .insert()
        .values({ userId, roleId: role.id, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId, externalValue })
        .orIgnore()
        .returning('id')
        .execute();
      if (inserted.raw.length > 0) added.push(roleKey);
    }
    return { added, removed, updated };
  }

  async listRoles(): Promise<RoleRecord[]> {
    const roles = await this.source.getRepository(Role).find({ relations: { rolePermissions: true } });
    return roles.map(toRoleRecord);
  }

  async listRolesWithUserCounts(): Promise<RoleWithUserCount[]> {
    const roles = await this.source.getRepository(Role).find({
      relations: { rolePermissions: true },
      order: { isSystemManaged: 'DESC', name: 'ASC' },
    });
    const counts = await this.source
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin('ur.user', 'u', 'u.deletedAt IS NULL')
      .select('ur.roleId', 'roleId')
      .addSelect('COUNT(DISTINCT ur.userId)', 'userCount')
      .groupBy('ur.roleId')
      .getRawMany<{ roleId: number; userCount: string }>();
    const countByRoleId = new Map(counts.map((c) => [Number(c.roleId), Number(c.userCount)]));
    return roles.map((role) => ({ ...toRoleRecord(role), userCount: countByRoleId.get(role.id) ?? 0 }));
  }

  async listPermissions(): Promise<PermissionRecord[]> {
    const rows = await this.source
      .getRepository(Permission)
      .find({ where: { available: true }, order: { category: 'ASC', key: 'ASC' } });
    return rows.map(toPermissionRecord);
  }

  async listUnavailablePermissionKeys(): Promise<string[]> {
    const rows = await this.source
      .getRepository(Permission)
      .find({ where: { available: false }, select: { key: true } });
    return rows.map((row) => row.key);
  }

  async findKnownPermissionKeys(keys: string[]): Promise<string[]> {
    const found = await this.source.getRepository(Permission).find({ where: { key: In(keys), available: true } });
    return found.map((p) => p.key);
  }

  async roleKeyTaken(key: string): Promise<boolean> {
    return this.source.getRepository(Role).existsBy({ key });
  }

  async createRole(
    role: { key: string; name: string; description: string },
    permissionKeys: string[],
  ): Promise<RoleRecord> {
    return this.tx.run(undefined, async (manager) => {
      const roles = manager.getRepository(Role);
      const saved = await roles.save(roles.create({ ...role, isSystemManaged: false, isDefault: false }));
      if (permissionKeys.length > 0) {
        const grants = manager.getRepository(RolePermission);
        await grants.save(permissionKeys.map((permissionKey) => grants.create({ roleId: saved.id, permissionKey })));
      }
      return toRoleRecord(await roles.findOneOrFail({ where: { id: saved.id }, relations: { rolePermissions: true } }));
    });
  }

  async updateRoleDetails(
    roleId: number,
    details: { name: string; description: string },
    context?: TransactionContext,
  ): Promise<void> {
    await this.manager(context).save(Role, { id: roleId, name: details.name, description: details.description });
  }

  async addRolePermissions(roleId: number, permissionKeys: string[], context: TransactionContext): Promise<void> {
    const manager = this.manager(context);
    for (const permissionKey of permissionKeys) {
      await manager.save(RolePermission, manager.create(RolePermission, { roleId, permissionKey }));
    }
  }

  async removeRolePermissions(roleId: number, permissionKeys: string[], context: TransactionContext): Promise<void> {
    await this.manager(context).delete(RolePermission, { roleId, permissionKey: In(permissionKeys) });
  }

  async reassignRoleHolders(fromRoleId: number, toRoleId: number, context: TransactionContext): Promise<void> {
    const manager = this.manager(context);
    const assignments = await manager.find(UserRole, { where: { roleId: fromRoleId } });
    for (const userId of new Set(assignments.map((a) => a.userId))) {
      const existing = await manager.findOne(UserRole, {
        where: { userId, roleId: toRoleId, source: UserRoleSource.MANUAL },
      });
      if (!existing) {
        await manager.save(
          UserRole,
          manager.create(UserRole, { userId, roleId: toRoleId, source: UserRoleSource.MANUAL }),
        );
      }
    }
  }

  async deleteRole(roleId: number, context: TransactionContext): Promise<void> {
    await this.manager(context).delete(Role, { id: roleId });
  }
}
