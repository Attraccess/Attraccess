/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
import { UserRoleSource, RolePermission } from '@attraccess/application-models';
import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { UserNotFoundException } from './../../exceptions/user.notFound.exception';
import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';
import { RoleGrantConflictError } from './persistence/port';

describe('RbacService', () => {
  const fixture = registerRbacServiceFixture();

  it('detects the last active administrator and handles absent role assignments', async () => {
    fixture.persistence.roleById.mockResolvedValue(null);
    expect(await fixture.service.isLastAdministrator(10)).toBe(false);
    fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 1, key: 'administrator' }));
    fixture.persistence.grant.mockResolvedValue(null);
    expect(await fixture.service.isLastAdministrator(10)).toBe(false);
    fixture.persistence.grant.mockResolvedValue(fixture.makeUserRole());
    fixture.persistence.administratorGrantCount.mockResolvedValue(0);
    expect(await fixture.service.isLastAdministrator(10)).toBe(true);
    fixture.persistence.administratorGrantCount.mockResolvedValue(1);
    const scope = fixture.parentScope();
    expect(await fixture.service.isLastAdministrator(10, scope)).toBe(false);
  });

  it('assigns a role by key idempotently and supports a containing transaction', async () => {
    fixture.persistence.roleById.mockResolvedValue(null);
    expect(await fixture.service.assignRoleByKey(10, 'missing')).toBeNull();
    fixture.persistence.roleById.mockResolvedValue(fixture.makeRole());
    const existing = fixture.makeUserRole();
    fixture.persistence.grant.mockResolvedValue(existing);
    expect(await fixture.service.assignRoleByKey(10, 'member')).toEqual(existing);
    expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    fixture.persistence.grant.mockResolvedValue(null);
    fixture.persistence.createGrant.mockResolvedValue(existing);
    await fixture.service.assignRoleByKey(10, 'member');
    expect(fixture.persistence.createGrant).toHaveBeenCalledWith({
      userId: 10,
      roleId: 1,
      source: UserRoleSource.MANUAL,
    });
    jest.mocked(fixture.eventEmitter.emit).mockClear();
    const scope = fixture.parentScope();
    await fixture.service.assignRoleByKey(10, 'member', scope);
    expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  it('looks up a single role key without loading role permissions', async () => {
    fixture.persistence.roleKey.mockResolvedValue('operator');

    await expect(fixture.service.getRoleKey(7)).resolves.toBe('operator');
    expect(fixture.persistence.roleKey).toHaveBeenCalledWith(7);
    expect(fixture.persistence.roles).not.toHaveBeenCalled();
  });

  // ───────────────────────── getEffectivePermissions ─────────────────────────

  describe('getEffectivePermissions', () => {
    it('returns empty set when user has no roles', async () => {
      fixture.persistence.effectivePermissionKeys.mockResolvedValue([]);

      const perms = await fixture.service.getEffectivePermissions(10);

      expect(perms.size).toBe(0);
    });

    it('returns union of all permissions from all assigned roles', async () => {
      const rows = [{ permissionKey: 'resources.read' }, { permissionKey: 'resources.write' }];
      fixture.persistence.effectivePermissionKeys.mockResolvedValue(rows.map((row) => row.permissionKey));

      const perms = await fixture.service.getEffectivePermissions(10);

      expect(perms.has('resources.read')).toBe(true);
      expect(perms.has('resources.write')).toBe(true);
      expect(perms.size).toBe(2);
    });

    it('handles roles with no rolePermissions gracefully', async () => {
      fixture.persistence.effectivePermissionKeys.mockResolvedValue([]);

      const perms = await fixture.service.getEffectivePermissions(10);

      expect(perms.size).toBe(0);
    });
  });

  // ─────────────────────── getUserIdsWithPermission ──────────────────────────

  describe('getUserIdsWithPermission', () => {
    // Soft-deleting a user leaves their user_role rows behind, so without this join a deleted
    // admin stays a permission holder forever — e.g. counted as an available supervisor (ATT-867).
    it('returns eligible permission holders supplied by persistence', async () => {
      fixture.persistence.userIdsWithPermission.mockResolvedValue([10]);

      const ids = await fixture.service.getUserIdsWithPermission('resources.update');

      expect(ids).toEqual([10]);
      expect(fixture.persistence.userIdsWithPermission).toHaveBeenCalledWith('resources.update');
    });
  });

  // ───────────────────────────── assignRole ──────────────────────────────────

  describe('assignRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      fixture.persistence.userExists.mockResolvedValue(false);

      await expect(fixture.service.assignRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      fixture.persistence.roleById.mockResolvedValue(null);

      await expect(fixture.service.assignRole(10, 99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.write' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(role);

      const actorPermissions = new Set(['resources.read']); // missing resources.write

      await expect(fixture.service.assignRole(10, 1, actorPermissions)).rejects.toThrow(ForbiddenException);
    });

    it('returns existing UserRole if already assigned', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(role);
      const existing = fixture.makeUserRole();
      fixture.persistence.grant.mockResolvedValue(existing);

      const actorPermissions = new Set(['resources.read']);
      const result = await fixture.service.assignRole(10, 1, actorPermissions);

      expect(result).toEqual(existing);
      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    });

    it('creates and returns a new UserRole when actor has all permissions', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(role);
      fixture.persistence.grant.mockResolvedValue(null);
      const saved = fixture.makeUserRole();
      fixture.persistence.createGrant.mockResolvedValue(saved);

      const actorPermissions = new Set(['resources.read', 'resources.write']);
      const result = await fixture.service.assignRole(10, 1, actorPermissions);

      expect(fixture.persistence.createGrant).toHaveBeenCalled();
      expect(result).toEqual(saved);
    });

    it('succeeds when role grants no permissions (empty permission set)', async () => {
      const role = fixture.makeRole({ rolePermissions: [] });
      fixture.persistence.roleById.mockResolvedValue(role);
      fixture.persistence.grant.mockResolvedValue(null);
      const saved = fixture.makeUserRole();
      fixture.persistence.createGrant.mockResolvedValue(saved);

      const result = await fixture.service.assignRole(10, 1, new Set());

      expect(result).toEqual(saved);
    });
  });

  // ───────────────────────────── revokeRole ──────────────────────────────────

  describe('revokeRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      fixture.persistence.userExists.mockResolvedValue(false);

      await expect(fixture.service.revokeRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      fixture.persistence.roleById.mockResolvedValue(null);

      await expect(fixture.service.revokeRole(10, 99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.write' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(role);

      await expect(fixture.service.revokeRole(10, 1, new Set(['resources.read']))).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when removing last administrator', async () => {
      const administratorRole = fixture.makeRole({
        key: 'administrator',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(administratorRole);

      fixture.persistence.administratorGrantCount.mockResolvedValue(1);

      await expect(fixture.service.revokeRole(10, 1, new Set(['system.admin']))).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when role is not manually assigned to the user', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(role);
      fixture.persistence.removeManualGrant.mockResolvedValue(false);

      await expect(fixture.service.revokeRole(10, 1, new Set(['resources.read']))).rejects.toThrow(ConflictException);
    });

    it('succeeds when actor has all permissions and assignment is manual', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(role);
      fixture.persistence.removeManualGrant.mockResolvedValue(true);

      await expect(fixture.service.revokeRole(10, 1, new Set(['resources.read']))).resolves.toBeUndefined();
      expect(fixture.persistence.removeManualGrant).toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).toHaveBeenCalledWith(
        UserPermissionsChangedEvent.EVENT_NAME,
        new UserPermissionsChangedEvent(10),
      );
    });

    it('allows revoking administrator role when multiple administrators exist', async () => {
      const administratorRole = fixture.makeRole({
        key: 'administrator',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      fixture.persistence.roleById.mockResolvedValue(administratorRole);

      fixture.persistence.administratorGrantCount.mockResolvedValue(2);

      await expect(fixture.service.revokeRole(10, 1, new Set(['system.admin']))).resolves.toBeUndefined();
      expect(fixture.persistence.removeManualGrant).toHaveBeenCalled();
    });
  });

  // ───────────────────────────── syncSsoRoles ────────────────────────────────

  describe('syncSsoRoles', () => {
    const SSO_TYPE = 'oidc';
    const SSO_ID = 42;

    it('rolls back the entire role sync when a later mutation fails', async () => {
      const removed = fixture.makeUserRole({
        id: 5,
        source: UserRoleSource.SSO,
        role: fixture.makeRole({ key: 'member' }),
      });
      fixture.persistence.ssoGrants.mockResolvedValue([removed]);
      fixture.persistence.removeGrant.mockResolvedValue(undefined);
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 2, key: 'manager' }));
      fixture.persistence.grant.mockResolvedValue(null);
      fixture.persistence.createGrant.mockRejectedValue(new Error('write failed'));

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'manager' }], SSO_TYPE, SSO_ID)).rejects.toThrow(
        'write failed',
      );
      expect(fixture.driver.run).toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('removes SSO roles no longer in the target set', async () => {
      const droppedRole = fixture.makeRole({ key: 'member' });
      const currentSsoRoles = [fixture.makeUserRole({ id: 5, source: UserRoleSource.SSO, role: droppedRole })];
      fixture.persistence.ssoGrants.mockResolvedValue(currentSsoRoles);
      fixture.persistence.removeGrant.mockResolvedValue(undefined);

      // target set is empty — member should be removed
      await fixture.service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(fixture.persistence.removeGrant).toHaveBeenCalledWith(5);
    });

    it('skips administrator role removal when it is the last administrator', async () => {
      const administratorRole = fixture.makeRole({ key: 'administrator' });
      const currentSsoRoles = [fixture.makeUserRole({ id: 7, source: UserRoleSource.SSO, role: administratorRole })];
      fixture.persistence.ssoGrants.mockResolvedValue(currentSsoRoles);

      // otherAdministratorCount = 0 — this is the last administrator, skip removal
      fixture.persistence.administratorGrantCount.mockResolvedValue(0);

      // target set does not include 'administrator'
      await fixture.service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(fixture.persistence.removeGrant).not.toHaveBeenCalled();
    });

    it('removes administrator role when other administrators exist', async () => {
      const administratorRole = fixture.makeRole({ key: 'administrator' });
      const currentSsoRoles = [fixture.makeUserRole({ id: 7, source: UserRoleSource.SSO, role: administratorRole })];
      fixture.persistence.ssoGrants.mockResolvedValue(currentSsoRoles);

      // Another administrator exists
      fixture.persistence.administratorGrantCount.mockResolvedValue(1);
      fixture.persistence.removeGrant.mockResolvedValue(undefined);

      await fixture.service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(fixture.persistence.removeGrant).toHaveBeenCalledWith(7);
    });

    it('adds new roles that are in the target set but not yet assigned', async () => {
      fixture.persistence.ssoGrants.mockResolvedValue([]); // no existing SSO roles
      const newRole = fixture.makeRole({ id: 3, key: 'manager' });
      fixture.persistence.roleById.mockResolvedValue(newRole);
      fixture.persistence.grant.mockResolvedValue(null); // not already present
      const saved = fixture.makeUserRole({ roleId: 3, source: UserRoleSource.SSO });
      fixture.persistence.createGrant.mockResolvedValue(saved);

      await fixture.service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'idp_manager' }], SSO_TYPE, SSO_ID);

      expect(fixture.persistence.createGrant).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 3, source: UserRoleSource.SSO, externalValue: 'idp_manager' }),
      );
      expect(fixture.persistence.createGrant).toHaveBeenCalled();
    });

    it('refreshes externalValue on an existing SSO assignment when it changes', async () => {
      const existingRole = fixture.makeRole({ key: 'manager' });
      const currentSsoRoles = [
        fixture.makeUserRole({ id: 9, source: UserRoleSource.SSO, role: existingRole, externalValue: 'old_group' }),
      ];
      fixture.persistence.ssoGrants.mockResolvedValue(currentSsoRoles);

      await fixture.service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'new_group' }], SSO_TYPE, SSO_ID);

      expect(fixture.persistence.updateExternalValue).toHaveBeenCalledWith(9, 'new_group');
      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    });

    it('skips adding a role when already present in currentSsoRoles', async () => {
      const existingRole = fixture.makeRole({ key: 'manager' });
      const currentSsoRoles = [fixture.makeUserRole({ source: UserRoleSource.SSO, role: existingRole })];
      fixture.persistence.ssoGrants.mockResolvedValue(currentSsoRoles);

      await fixture.service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'idp_manager' }], SSO_TYPE, SSO_ID);

      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    });

    it('handles a concurrent role grant gracefully', async () => {
      fixture.persistence.ssoGrants.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.persistence.roleById.mockResolvedValue(newRole);
      fixture.persistence.grant.mockResolvedValue(null);

      const uniqueViolation = new RoleGrantConflictError('concurrent grant');
      fixture.persistence.createGrant.mockRejectedValue(uniqueViolation);

      // Should NOT throw
      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).resolves.toEqual({
        added: [],
        removed: [],
        updated: [],
      });
    });

    it('does not publish a duplicate role grant', async () => {
      fixture.persistence.ssoGrants.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.persistence.roleById.mockResolvedValue(newRole);
      fixture.persistence.grant.mockResolvedValue(null);

      const sqliteViolation = new RoleGrantConflictError('concurrent grant');
      fixture.persistence.createGrant.mockRejectedValue(sqliteViolation);

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).resolves.toEqual({
        added: [],
        removed: [],
        updated: [],
      });
    });

    it('propagates storage integrity failures', async () => {
      fixture.persistence.ssoGrants.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.persistence.roleById.mockResolvedValue(newRole);
      fixture.persistence.grant.mockResolvedValue(null);

      const fkError = new Error('storage failed');
      fixture.persistence.createGrant.mockRejectedValue(fkError);

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).rejects.toThrow(Error);
    });

    it('rethrows non-unique-constraint errors', async () => {
      fixture.persistence.ssoGrants.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.persistence.roleById.mockResolvedValue(newRole);
      fixture.persistence.grant.mockResolvedValue(null);

      const otherError = new Error('storage failed');
      fixture.persistence.createGrant.mockRejectedValue(otherError);

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).rejects.toThrow(Error);
    });

    it('silently skips roles that do not exist in the database', async () => {
      fixture.persistence.ssoGrants.mockResolvedValue([]);
      fixture.persistence.roleById.mockResolvedValue(null); // unknown role key

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'unknown-role' }], SSO_TYPE, SSO_ID)).resolves.toEqual({
        added: [],
        removed: [],
        updated: [],
      });
      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────── assignDefaultRoles ─────────────────────────────

  describe('assignDefaultRoles', () => {
    it('assigns all isDefault roles that are not yet assigned', async () => {
      const defaultRoles = [
        fixture.makeRole({ id: 1, key: 'basic', isDefault: true }),
        fixture.makeRole({ id: 2, key: 'reader', isDefault: true }),
      ];
      fixture.persistence.roles.mockResolvedValue(defaultRoles);
      fixture.persistence.grant.mockResolvedValue(null); // neither already assigned
      const saved = fixture.makeUserRole();
      fixture.persistence.createGrant.mockResolvedValue(saved);

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.persistence.createGrant).toHaveBeenCalledTimes(2);
    });

    it('skips roles that are already assigned', async () => {
      const defaultRoles = [fixture.makeRole({ id: 1, key: 'basic', isDefault: true })];
      fixture.persistence.roles.mockResolvedValue(defaultRoles);
      fixture.persistence.grant.mockResolvedValue(fixture.makeUserRole()); // already exists

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    });

    it('does nothing when there are no default roles', async () => {
      fixture.persistence.roles.mockResolvedValue([]);

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
    });

    it('does not invalidate before a caller-owned transaction commits', async () => {
      fixture.persistence.roles.mockResolvedValue([fixture.makeRole({ id: 1, key: 'basic', isDefault: true })]);
      fixture.persistence.grant.mockResolvedValue(null);
      const scope = fixture.parentScope();

      await fixture.service.assignDefaultRoles(10, scope);

      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getRolesWithUsage', () => {
    it('merges user counts into roles', async () => {
      fixture.persistence.roles.mockResolvedValue([
        fixture.makeRole({ id: 1 }),
        fixture.makeRole({ id: 2, key: 'other' }),
      ]);
      fixture.persistence.roleUserCounts.mockResolvedValue([{ roleId: 1, userCount: 3 }]);

      const result = await fixture.service.getRolesWithUsage();

      expect(result.find((r) => r.id === 1)?.userCount).toBe(3);
      expect(result.find((r) => r.id === 2)?.userCount).toBe(0);
    });
  });

  describe('createRole', () => {
    it('creates a custom role with a slugified key and permissions', async () => {
      fixture.persistence.permissionsByKeys.mockResolvedValue([fixture.makePermission('resources.read')]);
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 42, key: 'workshop-supervisor' }));

      await fixture.service.createRole(
        { name: 'Workshop Supervisor!', description: 'desc', permissionKeys: ['resources.read'] },
        new Set(['resources.read']),
      );

      expect(fixture.persistence.createRole).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'workshop-supervisor', name: 'Workshop Supervisor!', isSystemManaged: false }),
      );
      expect(fixture.persistence.addPermissions).toHaveBeenCalledWith(42, ['resources.read']);
    });

    it('appends a numeric suffix when the key is already taken', async () => {
      fixture.persistence.permissionsByKeys.mockResolvedValue([]);
      (fixture.persistence.roleKeyExists as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 42 }));

      await fixture.service.createRole({ name: 'User' }, new Set());

      expect(fixture.persistence.createRole).toHaveBeenCalledWith(expect.objectContaining({ key: 'user-2' }));
    });

    it('rejects unknown permission keys', async () => {
      fixture.persistence.permissionsByKeys.mockResolvedValue([]);

      await expect(
        fixture.service.createRole({ name: 'X', permissionKeys: ['not.a.permission'] }, new Set(['not.a.permission'])),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects granting permissions the actor does not have', async () => {
      fixture.persistence.permissionsByKeys.mockResolvedValue([fixture.makePermission('billing.manage')]);

      await expect(
        fixture.service.createRole({ name: 'X', permissionKeys: ['billing.manage'] }, new Set(['resources.read'])),
      ).rejects.toThrow(ForbiddenException);
      expect(fixture.persistence.createRole).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('throws NotFoundException for a missing role', async () => {
      fixture.persistence.roleById.mockResolvedValue(null);

      await expect(fixture.service.updateRole(99, { name: 'X' }, new Set())).rejects.toThrow(NotFoundException);
    });

    it('rejects modification of system-managed roles', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ isSystemManaged: true }));

      await expect(fixture.service.updateRole(1, { name: 'X' }, new Set())).rejects.toThrow(ForbiddenException);
    });

    it('updates name and description without touching permissions', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 5 }));

      await fixture.service.updateRole(5, { name: ' New Name ', description: 'new desc' }, new Set());

      expect(fixture.persistence.saveRoleFields).toHaveBeenCalledWith(5, 'New Name', 'new desc');
      expect(fixture.driver.run).not.toHaveBeenCalled();
    });

    it('rejects adding permissions the actor does not have', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 5, rolePermissions: [] }));
      fixture.persistence.permissionsByKeys.mockResolvedValue([fixture.makePermission('billing.manage')]);

      await expect(
        fixture.service.updateRole(5, { permissionKeys: ['billing.manage'] }, new Set(['resources.read'])),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects removing permissions the actor does not have', async () => {
      fixture.persistence.roleById.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'billing.manage' } as RolePermission],
        }),
      );
      fixture.persistence.permissionsByKeys.mockResolvedValue([]);

      await expect(fixture.service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks a permission removal that would leave no administrator-equivalent user', async () => {
      fixture.persistence.roleById.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission],
        }),
      );
      fixture.persistence.permissionCount.mockResolvedValue(16);
      fixture.persistence.fullPermissionHolderCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(fixture.service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows a permission removal when administrator-equivalence is preserved', async () => {
      fixture.persistence.roleById.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission],
        }),
      );
      fixture.persistence.permissionCount.mockResolvedValue(16);
      fixture.persistence.fullPermissionHolderCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      await fixture.service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']));

      expect(fixture.persistence.removePermissions).toHaveBeenCalledWith(5, ['resources.read']);
    });

    it('applies permission set changes in a transaction', async () => {
      fixture.persistence.roleById.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission],
        }),
      );
      fixture.persistence.permissionsByKeys.mockResolvedValue([fixture.makePermission('users.read')]);

      await fixture.service.updateRole(
        5,
        { permissionKeys: ['users.read'] },
        new Set(['users.read', 'resources.read']),
      );

      expect(fixture.persistence.removePermissions).toHaveBeenCalledWith(5, ['resources.read']);
      expect(fixture.persistence.addPermission).toHaveBeenCalledWith(5, 'users.read');
    });
  });

  describe('deleteRole', () => {
    const setAdministratorEquivalentCounts = (withoutRole: number, total: number) => {
      // countAdministratorEquivalentUsers is called twice: first excluding the role, then overall
      fixture.persistence.permissionCount.mockResolvedValue(16);
      fixture.persistence.fullPermissionHolderCount.mockResolvedValueOnce(withoutRole).mockResolvedValueOnce(total);
    };

    it('throws NotFoundException for a missing role', async () => {
      fixture.persistence.roleById.mockResolvedValue(null);

      await expect(fixture.service.deleteRole(99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('rejects deletion of system-managed roles', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ isSystemManaged: true }));

      await expect(fixture.service.deleteRole(1, new Set())).rejects.toThrow(ForbiddenException);
    });

    it('rejects deleting a role whose permissions exceed the actor', async () => {
      fixture.persistence.roleById.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'billing.manage' } as RolePermission],
        }),
      );

      await expect(fixture.service.deleteRole(5, new Set(['resources.read']))).rejects.toThrow(ForbiddenException);
      expect(fixture.persistence.removeRole).not.toHaveBeenCalled();
    });

    it('rejects reassigning to the role being deleted', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 5 }));

      await expect(fixture.service.deleteRole(5, new Set(), 5)).rejects.toThrow(BadRequestException);
    });

    it('rejects reassignment to a role whose permissions exceed the actor', async () => {
      fixture.persistence.roleById.mockResolvedValueOnce(fixture.makeRole({ id: 5 })).mockResolvedValueOnce(
        fixture.makeRole({
          id: 6,
          rolePermissions: [{ roleId: 6, permissionKey: 'billing.manage' } as RolePermission],
        }),
      );

      await expect(fixture.service.deleteRole(5, new Set(['resources.read']), 6)).rejects.toThrow(ForbiddenException);
    });

    it('blocks deletion that would leave no administrator-equivalent user', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 5 }));
      setAdministratorEquivalentCounts(0, 1);

      await expect(fixture.service.deleteRole(5, new Set())).rejects.toThrow(ForbiddenException);
      expect(fixture.persistence.removeRole).not.toHaveBeenCalled();
    });

    it('deletes a custom role when administrator-equivalence is preserved', async () => {
      fixture.persistence.roleById.mockResolvedValue(fixture.makeRole({ id: 5 }));
      setAdministratorEquivalentCounts(1, 1);

      await fixture.service.deleteRole(5, new Set());

      expect(fixture.persistence.removeRole).toHaveBeenCalledWith(5);
    });

    it('reassigns affected users to the target role before deleting', async () => {
      fixture.persistence.roleById
        .mockResolvedValueOnce(fixture.makeRole({ id: 5 }))
        .mockResolvedValueOnce(fixture.makeRole({ id: 6, rolePermissions: [] }));
      setAdministratorEquivalentCounts(1, 1);
      fixture.persistence.roleAssignments.mockResolvedValue([
        fixture.makeUserRole({ userId: 10, roleId: 5 }),
        fixture.makeUserRole({ id: 2, userId: 11, roleId: 5 }),
      ]);
      fixture.persistence.grant.mockResolvedValue(null);

      await fixture.service.deleteRole(5, new Set(), 6);

      expect(fixture.persistence.createGrant).toHaveBeenCalledTimes(2);
      expect(fixture.persistence.createGrant).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 10, roleId: 6, source: UserRoleSource.MANUAL }),
      );
      expect(fixture.persistence.removeRole).toHaveBeenCalledWith(5);
    });
  });
});
