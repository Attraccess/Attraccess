import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuditOrigin } from '../../audit/recorder/audit-event';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';
import {
  makePermission,
  makeRole,
  makeRoleWith,
  makeUserRole,
  registerRbacServiceFixture,
} from './rbac.service.rbac-service.test-fixture';

const origin: AuditOrigin = { actor: { id: 1, authenticationMethod: 'session' } };

describe('RbacService', () => {
  const fixture = registerRbacServiceFixture();

  it('detects the last active administrator through the store, inside the caller scope when given', async () => {
    fixture.store.isLastAdministrator.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const scope = { isOpen: true, afterCommit: jest.fn() };

    expect(await fixture.service.isLastAdministrator(10)).toBe(true);
    expect(await fixture.service.isLastAdministrator(10, scope)).toBe(false);

    expect(fixture.store.isLastAdministrator).toHaveBeenNthCalledWith(1, 10, undefined);
    expect(fixture.store.isLastAdministrator).toHaveBeenNthCalledWith(2, 10, scope);
  });

  it('accepts an engine transaction handle from a caller that has not moved to unit-of-work scopes yet', async () => {
    const manager = { connection: {} } as never;
    fixture.store.findRoleByKey.mockResolvedValue(makeRole({ id: 5, key: 'administrator' }));
    fixture.store.addManualAssignment.mockResolvedValue(makeUserRole({ roleId: 5 }));

    await fixture.service.assignRoleByKey(10, 'administrator', manager);

    const scope = fixture.store.findRoleByKey.mock.calls[0][1];
    expect(scope).toBe(fixture.store.addManualAssignment.mock.calls[0][2]);
    expect(scope).toBeDefined();
    expect(scope).toBe(manager);
  });

  describe('assignRoleByKey', () => {
    it('assigns a role by key idempotently and invalidates only without a containing transaction', async () => {
      const role = makeRole({ id: 3, key: 'member' });
      fixture.store.findRoleByKey.mockResolvedValue(role);
      fixture.store.addManualAssignment.mockResolvedValue(makeUserRole({ roleId: 3 }));

      await fixture.service.assignRoleByKey(10, 'member');
      expect(fixture.store.addManualAssignment).toHaveBeenCalledWith(10, 3, undefined);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledWith(
        UserPermissionsChangedEvent.EVENT_NAME,
        expect.objectContaining({ userId: 10 }),
      );

      const existing = makeUserRole({ id: 9, roleId: 3 });
      fixture.store.findManualAssignment.mockResolvedValue(existing);
      expect(await fixture.service.assignRoleByKey(10, 'member')).toBe(existing);
      expect(fixture.store.addManualAssignment).toHaveBeenCalledTimes(1);
    });

    it('returns null for an unknown role key', async () => {
      expect(await fixture.service.assignRoleByKey(10, 'nope')).toBeNull();
    });

    it('does not invalidate before a caller-owned transaction commits', async () => {
      fixture.store.findRoleByKey.mockResolvedValue(makeRole({ id: 3 }));
      fixture.store.addManualAssignment.mockResolvedValue(makeUserRole());

      await fixture.service.assignRoleByKey(10, 'member', { isOpen: true, afterCommit: jest.fn() });

      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  it('looks up a single role key', async () => {
    fixture.store.roleKeyOf.mockResolvedValueOnce('member').mockResolvedValueOnce(null);

    expect(await fixture.service.getRoleKey(4)).toBe('member');
    expect(await fixture.service.getRoleKey(5)).toBeNull();
  });

  describe('getEffectivePermissions', () => {
    it('returns empty set when user has no roles', async () => {
      expect((await fixture.service.getEffectivePermissions(1)).size).toBe(0);
    });

    it('returns the permissions of all assigned roles and caches them until bypassed', async () => {
      fixture.store.permissionKeysOf.mockResolvedValue(['a.read', 'b.write']);

      expect([...(await fixture.service.getEffectivePermissions(1))].sort()).toEqual(['a.read', 'b.write']);
      await fixture.service.getEffectivePermissions(1);
      expect(fixture.store.permissionKeysOf).toHaveBeenCalledTimes(1);

      await fixture.service.getEffectivePermissions(1, true);
      expect(fixture.store.permissionKeysOf).toHaveBeenCalledTimes(2);
    });
  });

  it('lists the users holding a permission through the store', async () => {
    fixture.store.userIdsWithPermission.mockResolvedValue([3, 4]);

    expect(await fixture.service.getUserIdsWithPermission('x.y')).toEqual([3, 4]);
    expect(fixture.store.userIdsWithPermission).toHaveBeenCalledWith('x.y');
  });

  describe('assignRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      fixture.store.userExists.mockResolvedValue(false);
      await expect(fixture.service.assignRole(99, 1, new Set())).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      await expect(fixture.service.assignRole(10, 99, new Set())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read', 'b.write']));

      await expect(fixture.service.assignRole(10, 1, new Set(['a.read']))).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.store.addManualAssignment).not.toHaveBeenCalled();
    });

    it('returns the existing assignment without a second write', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));
      const existing = makeUserRole();
      fixture.store.findManualAssignment.mockResolvedValue(existing);

      expect(await fixture.service.assignRole(10, 1, new Set(['a.read']))).toBe(existing);
      expect(fixture.store.addManualAssignment).not.toHaveBeenCalled();
    });

    it('creates a new assignment when the actor holds every permission, and succeeds for an empty role', async () => {
      const created = makeUserRole({ id: 2 });
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));
      fixture.store.addManualAssignment.mockResolvedValue(created);

      expect(await fixture.service.assignRole(10, 1, new Set(['a.read']))).toBe(created);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledTimes(1);

      fixture.store.findRoleById.mockResolvedValue(makeRole());
      expect(await fixture.service.assignRole(10, 1, new Set())).toBe(created);
    });
  });

  describe('revokeRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      fixture.store.userExists.mockResolvedValue(false);
      await expect(fixture.service.revokeRole(99, 1, new Set())).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      await expect(fixture.service.revokeRole(10, 99, new Set())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));
      await expect(fixture.service.revokeRole(10, 1, new Set())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to remove the last administrator and checks the count in the same unit of work as the delete', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ id: 2, key: 'administrator' }));
      fixture.store.countActiveRoleHolders.mockResolvedValue(1);

      await expect(fixture.service.revokeRole(10, 2, new Set())).rejects.toBeInstanceOf(ForbiddenException);

      expect(fixture.store.countActiveRoleHolders).toHaveBeenCalledWith(2, fixture.uow.scopes[0]);
      expect(fixture.store.revokeManualAssignment).not.toHaveBeenCalled();
    });

    it('allows revoking the administrator role when multiple administrators exist', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ id: 2, key: 'administrator' }));
      fixture.store.countActiveRoleHolders.mockResolvedValue(2);

      await fixture.service.revokeRole(10, 2, new Set());

      expect(fixture.store.revokeManualAssignment).toHaveBeenCalledWith(10, 2, fixture.uow.scopes[0]);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the role is not manually assigned to the user', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole());
      fixture.store.revokeManualAssignment.mockResolvedValue(false);

      await expect(fixture.service.revokeRole(10, 1, new Set())).rejects.toBeInstanceOf(ConflictException);
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('revokes a manual assignment when the actor holds every permission', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));

      await fixture.service.revokeRole(10, 1, new Set(['a.read']));

      expect(fixture.store.revokeManualAssignment).toHaveBeenCalledWith(10, 1);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncSsoRoles', () => {
    it('runs the reconciliation in one unit of work and invalidates only when something changed', async () => {
      fixture.store.syncSsoAssignments.mockResolvedValueOnce({ added: ['member'], removed: [], updated: [] });
      fixture.store.syncSsoAssignments.mockResolvedValueOnce({ added: [], removed: [], updated: [] });

      expect(await fixture.service.syncSsoRoles(10, [{ roleKey: 'member' }], 'oidc', 3)).toEqual({
        added: ['member'],
        removed: [],
        updated: [],
      });
      expect(fixture.store.syncSsoAssignments).toHaveBeenCalledWith(
        10,
        [{ roleKey: 'member' }],
        'oidc',
        3,
        fixture.uow.scopes[0],
      );
      expect(fixture.eventEmitter.emit).toHaveBeenCalledTimes(1);

      await fixture.service.syncSsoRoles(10, [], 'oidc', 3);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledTimes(1);
    });

    it('does not invalidate when the reconciliation fails', async () => {
      fixture.store.syncSsoAssignments.mockRejectedValueOnce(new Error('write failed'));

      await expect(fixture.service.syncSsoRoles(10, [], 'oidc', 3)).rejects.toThrow('write failed');
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('assignDefaultRoles', () => {
    it('assigns all default roles that are not yet assigned', async () => {
      fixture.store.findDefaultRoles.mockResolvedValue([makeRole({ id: 1 }), makeRole({ id: 2 })]);
      fixture.store.findManualAssignment.mockResolvedValueOnce(null).mockResolvedValueOnce(makeUserRole());

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.store.addManualAssignment).toHaveBeenCalledTimes(1);
      expect(fixture.store.addManualAssignment).toHaveBeenCalledWith(10, 1, undefined);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there are no default roles', async () => {
      await fixture.service.assignDefaultRoles(10);
      expect(fixture.store.addManualAssignment).not.toHaveBeenCalled();
    });

    it('does not invalidate before a caller-owned transaction commits', async () => {
      fixture.store.findDefaultRoles.mockResolvedValue([makeRole({ id: 1 })]);

      await fixture.service.assignDefaultRoles(10, { isOpen: true, afterCommit: jest.fn() });

      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  it('lists roles with their user counts and permissions', async () => {
    const roles = [{ ...makeRole(), userCount: 3 }];
    fixture.store.listRolesWithUserCounts.mockResolvedValue(roles);

    expect(await fixture.service.getRolesWithUsage()).toBe(roles);
    fixture.store.listPermissions.mockResolvedValue([makePermission('a.read')]);
    expect((await fixture.service.getPermissions()).map((p) => p.key)).toEqual(['a.read']);
  });

  describe('createRole', () => {
    it('creates a custom role with a slugified key and permissions', async () => {
      fixture.store.findKnownPermissionKeys.mockResolvedValue(['a.read']);
      fixture.store.createRole.mockResolvedValue(makeRoleWith(['a.read'], { id: 42, key: 'lab-tech' }));

      const created = await fixture.service.createRole(
        { name: ' Lab Tech! ', description: ' d ', permissionKeys: ['a.read'] },
        new Set(['a.read']),
        origin,
      );

      expect(fixture.store.createRole).toHaveBeenCalledWith({ key: 'lab-tech', name: 'Lab Tech!', description: 'd' }, [
        'a.read',
      ]);
      expect(created.id).toBe(42);
      expect(fixture.audit.record).toHaveBeenCalledWith(expect.objectContaining({ domain: 'identity' }));
    });

    it('appends a numeric suffix when the key is already taken', async () => {
      fixture.store.roleKeyTaken.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
      fixture.store.createRole.mockResolvedValue(makeRole({ key: 'lab-3' }));

      await fixture.service.createRole({ name: 'Lab', permissionKeys: [] }, new Set(), origin);

      expect(fixture.store.createRole.mock.calls[0][0]).toMatchObject({ key: 'lab-3', description: '' });
    });

    it('rejects unknown permission keys', async () => {
      fixture.store.findKnownPermissionKeys.mockResolvedValue(['a.read']);

      await expect(
        fixture.service.createRole({ name: 'X', permissionKeys: ['a.read', 'zz'] }, new Set(['a.read']), origin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.store.createRole).not.toHaveBeenCalled();
    });

    it('rejects granting permissions the actor does not have', async () => {
      fixture.store.findKnownPermissionKeys.mockResolvedValue(['a.read']);

      await expect(
        fixture.service.createRole({ name: 'X', permissionKeys: ['a.read'] }, new Set(), origin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.store.createRole).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('throws NotFoundException for a missing role', async () => {
      await expect(fixture.service.updateRole(9, {}, new Set(), origin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects modification of system-managed roles', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ isSystemManaged: true }));
      await expect(fixture.service.updateRole(1, { name: 'x' }, new Set(), origin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('updates name and description without touching permissions', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ name: 'Old', description: 'Old' }));

      await fixture.service.updateRole(1, { name: ' New ' }, new Set(), origin);

      expect(fixture.store.updateRoleDetails).toHaveBeenCalledWith(1, { name: 'New', description: 'Old' });
      expect(fixture.store.addRolePermissions).not.toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rejects adding or removing permissions the actor does not have', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));
      fixture.store.findKnownPermissionKeys.mockImplementation(async (keys: string[]) => keys);

      await expect(
        fixture.service.updateRole(1, { permissionKeys: ['a.read', 'b.write'] }, new Set(['a.read']), origin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(fixture.service.updateRole(1, { permissionKeys: [] }, new Set(), origin)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(fixture.store.updateRoleDetails).not.toHaveBeenCalled();
    });

    it('blocks a permission removal that would leave no administrator-equivalent user', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));
      fixture.store.findKnownPermissionKeys.mockResolvedValue([]);
      fixture.store.countAdministratorEquivalentUsers.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(
        fixture.service.updateRole(1, { permissionKeys: [] }, new Set(['a.read']), origin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('applies permission set changes in one unit of work and invalidates every cache entry', async () => {
      fixture.store.findRoleById
        .mockResolvedValueOnce(makeRoleWith(['a.read', 'b.write']))
        .mockResolvedValueOnce(makeRoleWith(['b.write', 'c.run']));
      fixture.store.findKnownPermissionKeys.mockImplementation(async (keys: string[]) => keys);
      fixture.store.countAdministratorEquivalentUsers.mockResolvedValue(1);

      await fixture.service.updateRole(
        1,
        { permissionKeys: ['b.write', 'c.run'] },
        new Set(['a.read', 'c.run']),
        origin,
      );

      const [scope] = fixture.uow.scopes;
      expect(fixture.uow.scopes).toHaveLength(1);
      expect(fixture.store.removeRolePermissions).toHaveBeenCalledWith(1, ['a.read'], scope);
      expect(fixture.store.addRolePermissions).toHaveBeenCalledWith(1, ['c.run'], scope);
      expect(fixture.eventEmitter.emit).toHaveBeenCalledWith(
        UserPermissionsChangedEvent.EVENT_NAME,
        expect.objectContaining({ userId: undefined }),
      );
    });
  });

  describe('deleteRole', () => {
    it('throws NotFoundException for a missing role', async () => {
      await expect(fixture.service.deleteRole(9, new Set(), origin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects deletion of system-managed roles', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ isSystemManaged: true }));
      await expect(fixture.service.deleteRole(1, new Set(), origin)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects deleting a role whose permissions exceed the actor', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRoleWith(['a.read']));
      await expect(fixture.service.deleteRole(1, new Set(), origin)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects reassigning to the role being deleted, to a missing role and to a role beyond the actor', async () => {
      fixture.store.findRoleById.mockResolvedValueOnce(makeRole({ id: 1 }));
      await expect(fixture.service.deleteRole(1, new Set(), origin, 1)).rejects.toBeInstanceOf(BadRequestException);

      fixture.store.findRoleById.mockResolvedValueOnce(makeRole({ id: 1 })).mockResolvedValueOnce(null);
      await expect(fixture.service.deleteRole(1, new Set(), origin, 2)).rejects.toBeInstanceOf(NotFoundException);

      fixture.store.findRoleById
        .mockResolvedValueOnce(makeRole({ id: 1 }))
        .mockResolvedValueOnce(makeRoleWith(['x.y'], { id: 2 }));
      await expect(fixture.service.deleteRole(1, new Set(), origin, 2)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks deletion that would leave no administrator-equivalent user', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ id: 4 }));
      fixture.store.countAdministratorEquivalentUsers.mockResolvedValueOnce(0).mockResolvedValueOnce(2);

      await expect(fixture.service.deleteRole(4, new Set(), origin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.store.deleteRole).not.toHaveBeenCalled();
    });

    it('deletes a custom role when administrator-equivalence is preserved', async () => {
      fixture.store.findRoleById.mockResolvedValue(makeRole({ id: 4 }));
      fixture.store.countAdministratorEquivalentUsers.mockResolvedValue(1);

      await fixture.service.deleteRole(4, new Set(), origin);

      expect(fixture.store.deleteRole).toHaveBeenCalledWith(4, fixture.uow.scopes[0]);
      expect(fixture.store.reassignRoleHolders).not.toHaveBeenCalled();
      expect(fixture.audit.record).toHaveBeenCalledWith(expect.objectContaining({ domain: 'identity' }));
    });

    it('reassigns affected users to the target role before deleting, in the same unit of work', async () => {
      fixture.store.findRoleById
        .mockResolvedValueOnce(makeRole({ id: 4 }))
        .mockResolvedValueOnce(makeRole({ id: 5, key: 'other' }));
      fixture.store.countAdministratorEquivalentUsers.mockResolvedValue(1);

      await fixture.service.deleteRole(4, new Set(), origin, 5);

      const [scope] = fixture.uow.scopes;
      expect(fixture.store.reassignRoleHolders).toHaveBeenCalledWith(4, 5, scope);
      expect(fixture.store.deleteRole).toHaveBeenCalledWith(4, scope);
      expect(fixture.store.reassignRoleHolders.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.store.deleteRole.mock.invocationCallOrder[0],
      );
    });
  });
});
