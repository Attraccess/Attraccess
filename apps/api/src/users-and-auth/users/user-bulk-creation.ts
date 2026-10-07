import { Role, User } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UserAccountDeletionImplementation } from './user-account-deletion';
export abstract class UserBulkCreationImplementation extends UserAccountDeletionImplementation {
  async ensureLicenseForNewUsers(newUsersCount: number): Promise<void> {
    if (newUsersCount <= 0) {
      return;
    }

    const currentAmountOfUsers = await this.userRepository.count();
    await this.licenseService.verifyLicense({
      usageLimits: {
        users: currentAmountOfUsers + newUsersCount,
      },
    });
  }

  async createMany(
    users: Array<{ username: string; email: string; locale?: string; roleKey?: string }>,
    options?: { grantAllPermissionsToFirst?: boolean; manager?: EntityManager; actorId?: number },
  ): Promise<User[]> {
    if (users.length === 0) {
      return [];
    }

    const normalized = users.map((userData) => ({
      username: this.cleanupUsername(userData.username),
      email: userData.email.trim(),
      locale: userData.locale,
      roleKey: userData.roleKey,
    }));

    const run = async (manager: EntityManager) => {
      const repo = manager.getRepository(User);
      const totalExisting = await repo.count();

      const entities = normalized.map((data) => {
        this.validateUsernameOrThrow(data.username);
        if (!data.email) {
          throw new BadRequestException('Email is required');
        }

        const user = repo.create();
        user.username = data.username;
        user.email = data.email;
        user.externalIdentifier = null;
        if (data.locale) {
          user.locale = data.locale.trim() || 'en';
        }
        return user;
      });

      const saved = await repo.save(entities);

      // Assign administrator role to the first user when bootstrapping; default roles for everyone else.
      // Pass the transactional manager so role assignments are part of the same transaction.
      if (options?.grantAllPermissionsToFirst && totalExisting === 0 && saved.length > 0) {
        await this.rbacService.assignRoleByKey(saved[0].id, 'administrator', manager);
        for (const u of saved.slice(1)) {
          await this.rbacService.assignDefaultRoles(u.id, manager);
        }
      } else {
        for (const u of saved) {
          await this.rbacService.assignDefaultRoles(u.id, manager);
        }
      }

      // Assign per-user role keys (from CSV column mapping), in addition to default roles.
      // Privilege ceiling: if an actor is performing this import, they cannot grant a role whose
      // permissions exceed their own (mirrors the check in RbacService.assignRole).
      const anyHasRoleKey = normalized.some((n) => n.roleKey);
      const actorPermissions =
        anyHasRoleKey && options?.actorId != null
          ? await this.rbacService.getEffectivePermissions(options.actorId)
          : null;

      const roleRepo = manager.getRepository(Role);
      for (let i = 0; i < saved.length; i++) {
        const roleKey = normalized[i]?.roleKey;
        if (roleKey) {
          const role = await roleRepo.findOne({
            where: { key: roleKey },
            relations: ['rolePermissions'],
          });
          if (!role) {
            throw new BadRequestException(`Role with key '${roleKey}' not found`);
          }
          if (actorPermissions !== null) {
            const rolePermKeys = role.rolePermissions.map((rp) => rp.permissionKey);
            const missing = rolePermKeys.filter((k) => !actorPermissions.has(k));
            if (missing.length > 0) {
              throw new ForbiddenException('You cannot grant a role whose permissions exceed your own');
            }
          }
          await this.rbacService.assignRoleByKey(saved[i].id, roleKey, manager);
        }
      }

      return saved;
    };

    const savedUsers = await (options?.manager ? run(options.manager) : this.userRepository.manager.transaction(run));
    for (const u of savedUsers) {
      this.metricsService.usersPerLocale.inc({ locale: u.locale ?? 'en' });
    }
    return savedUsers;
  }
}
