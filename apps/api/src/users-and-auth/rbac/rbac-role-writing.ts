import { Role, RolePermission, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RbacServiceRouteContext } from './rbac.service.route-context';
export abstract class RbacRoleWritingImplementation extends RbacServiceRouteContext {
  protected async generateRoleKey(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-/, '')
        .replace(/-$/, '')
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
      await this.permissionsChanged();
    } else {
      await this.roleRepository.save({ id: role.id, name: role.name, description: role.description });
    }

    const updated = await this.roleRepository.findOne({ where: { id: roleId }, relations: ['rolePermissions'] });
    return updated as Role;
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
      throw new ForbiddenException(
        'Deleting this role would leave no active user with full administrative permissions',
      );
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
    await this.permissionsChanged();
  }

  protected assertActorHolds(actorPermissions: Set<string>, keys: string[], action: 'grant' | 'revoke'): void {
    const missing = keys.filter((k) => !actorPermissions.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException(`You cannot ${action} permissions you do not have: ${missing.join(', ')}`);
    }
  }
}
