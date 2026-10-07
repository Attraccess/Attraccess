import { Role, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { QueryFailedError, Repository } from 'typeorm';
import { RbacRoleAssignmentImplementation } from './rbac-role-assignment';
export abstract class RbacSsoRoleSyncImplementation extends RbacRoleAssignmentImplementation {
  async syncSsoRoles(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    const changes = await this.userRoleRepository.manager.transaction(async (manager) =>
      this.syncSsoRolesInTransaction(
        userId,
        roles,
        ssoProviderType,
        ssoProviderId,
        manager.getRepository(UserRole),
        manager.getRepository(Role),
      ),
    );
    this.permissionsCache.delete(userId);
    await this.permissionsChanged(userId);
    return changes;
  }

  protected async syncSsoRolesInTransaction(
    userId: number,
    roles: Array<{ roleKey: string; externalValue?: string | null }>,
    ssoProviderType: string,
    ssoProviderId: number,
    userRoleRepository: Repository<UserRole>,
    roleRepository: Repository<Role>,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    // roleKey -> external claim value that granted it (source metadata for the UI)
    const targetByKey = new Map(roles.map((r) => [r.roleKey, r.externalValue ?? null]));

    const currentSsoRoles = await userRoleRepository.find({
      where: { userId, source: UserRoleSource.SSO, ssoProviderType, ssoProviderId },
      relations: ['role'],
    });
    const removed: string[] = [];
    const added: string[] = [];
    const updated: string[] = [];

    for (const ur of currentSsoRoles) {
      if (!targetByKey.has(ur.role.key)) {
        // ponytail: last-administrator guardrail — transient IdP claim omission must not silently strip the last administrator
        if (ur.role.key === 'administrator') {
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
      if (!existing) {
        try {
          await userRoleRepository.save(
            userRoleRepository.create({
              userId,
              roleId: role.id,
              source: UserRoleSource.SSO,
              ssoProviderType,
              ssoProviderId,
              externalValue,
            }),
          );
          added.push(roleKey);
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
    return { added, removed, updated };
  }
}
