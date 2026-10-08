/* eslint-disable @typescript-eslint/no-explicit-any */

import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
import { Role, UserRoleSource, RolePermission, UserRole } from '@attraccess/database-entities';
import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { UserNotFoundException } from './../../exceptions/user.notFound.exception';
import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';
import { QueryFailedError } from 'typeorm';

describe('RbacService', () => {
  const fixture = registerRbacServiceFixture();

  it('detects the last active administrator and handles absent role assignments', async () => {
    fixture.roleRepo.findOne.mockResolvedValue(null);
    expect(await fixture.service.isLastAdministrator(10)).toBe(false);
    fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 1, key: 'administrator' }));
    fixture.userRoleRepo.findOne.mockResolvedValue(null);
    expect(await fixture.service.isLastAdministrator(10)).toBe(false);
    fixture.userRoleRepo.findOne.mockResolvedValue(fixture.makeUserRole());
    const query = fixture.createMockQueryBuilder();
    fixture.userRoleRepo.createQueryBuilder.mockReturnValue(query as never);
    expect(await fixture.service.isLastAdministrator(10)).toBe(true);
    expect(query.innerJoin).toHaveBeenCalledWith('ur.user', 'u', 'u.deletedAt IS NULL');
    query.getCount.mockResolvedValue(1);
    const manager = {
      getRepository: (entity) => (entity === Role ? fixture.roleRepo : fixture.userRoleRepo),
      createQueryBuilder: () => query,
    };
    expect(await fixture.service.isLastAdministrator(10, manager as never)).toBe(false);
  });

  it('assigns a role by key idempotently and supports a containing transaction', async () => {
    fixture.roleRepo.findOne.mockResolvedValue(null);
    expect(await fixture.service.assignRoleByKey(10, 'missing')).toBeNull();
    fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole());
    const existing = fixture.makeUserRole();
    fixture.userRoleRepo.findOne.mockResolvedValue(existing);
    expect(await fixture.service.assignRoleByKey(10, 'member')).toBe(existing);
    expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    fixture.userRoleRepo.findOne.mockResolvedValue(null);
    fixture.userRoleRepo.save.mockResolvedValue(existing);
    await fixture.service.assignRoleByKey(10, 'member');
    expect(fixture.userRoleRepo.create).toHaveBeenCalledWith({ userId: 10, roleId: 1, source: UserRoleSource.MANUAL });
    fixture.eventEmitter.emit.mockClear();
    const manager = { getRepository: (entity) => (entity === Role ? fixture.roleRepo : fixture.userRoleRepo) };
    await fixture.service.assignRoleByKey(10, 'member', manager as never);
    expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  it('looks up a single role key without loading role permissions', async () => {
    fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 7, key: 'operator' }));

    await expect(fixture.service.getRoleKey(7)).resolves.toBe('operator');
    expect(fixture.roleRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 }, select: { key: true } });
    expect(fixture.roleRepo.find).not.toHaveBeenCalled();
  });

  // ───────────────────────── getEffectivePermissions ─────────────────────────

  describe('getEffectivePermissions', () => {
    it('returns empty set when user has no roles', async () => {
      const mockQb = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const perms = await fixture.service.getEffectivePermissions(10);

      expect(perms.size).toBe(0);
    });

    it('returns union of all permissions from all assigned roles', async () => {
      const rows = [{ permissionKey: 'resources.read' }, { permissionKey: 'resources.write' }];
      const mockQb = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue(rows) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const perms = await fixture.service.getEffectivePermissions(10);

      expect(perms.has('resources.read')).toBe(true);
      expect(perms.has('resources.write')).toBe(true);
      expect(perms.size).toBe(2);
    });

    it('handles roles with no rolePermissions gracefully', async () => {
      const mockQb = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const perms = await fixture.service.getEffectivePermissions(10);

      expect(perms.size).toBe(0);
    });
  });

  // ─────────────────────── getUserIdsWithPermission ──────────────────────────

  describe('getUserIdsWithPermission', () => {
    // Soft-deleting a user leaves their user_role rows behind, so without this join a deleted
    // admin stays a permission holder forever — e.g. counted as an available supervisor (ATT-867).
    it('excludes soft-deleted users', async () => {
      const mockQb = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 10 }]) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const ids = await fixture.service.getUserIdsWithPermission('resources.update');

      expect(ids).toEqual([10]);
      expect(mockQb.innerJoin).toHaveBeenCalledWith('ur.user', 'u', 'u.deletedAt IS NULL');
    });
  });

  // ───────────────────────────── assignRole ──────────────────────────────────

  describe('assignRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      fixture.userRepo.existsBy.mockResolvedValue(false);

      await expect(fixture.service.assignRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(null);

      await expect(fixture.service.assignRole(10, 99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.write' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(role);

      const actorPermissions = new Set(['resources.read']); // missing resources.write

      await expect(fixture.service.assignRole(10, 1, actorPermissions)).rejects.toThrow(ForbiddenException);
    });

    it('returns existing UserRole if already assigned', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(role);
      const existing = fixture.makeUserRole();
      fixture.userRoleRepo.findOne.mockResolvedValue(existing);

      const actorPermissions = new Set(['resources.read']);
      const result = await fixture.service.assignRole(10, 1, actorPermissions);

      expect(result).toBe(existing);
      expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('creates and returns a new UserRole when actor has all permissions', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(role);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);
      const saved = fixture.makeUserRole();
      fixture.userRoleRepo.save.mockResolvedValue(saved);

      const actorPermissions = new Set(['resources.read', 'resources.write']);
      const result = await fixture.service.assignRole(10, 1, actorPermissions);

      expect(fixture.userRoleRepo.save).toHaveBeenCalled();
      expect(result).toBe(saved);
    });

    it('succeeds when role grants no permissions (empty permission set)', async () => {
      const role = fixture.makeRole({ rolePermissions: [] });
      fixture.roleRepo.findOne.mockResolvedValue(role);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);
      const saved = fixture.makeUserRole();
      fixture.userRoleRepo.save.mockResolvedValue(saved);

      const result = await fixture.service.assignRole(10, 1, new Set());

      expect(result).toBe(saved);
    });
  });

  // ───────────────────────────── revokeRole ──────────────────────────────────

  describe('revokeRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      fixture.userRepo.existsBy.mockResolvedValue(false);

      await expect(fixture.service.revokeRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(null);

      await expect(fixture.service.revokeRole(10, 99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.write' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(role);

      await expect(fixture.service.revokeRole(10, 1, new Set(['resources.read']))).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when removing last administrator', async () => {
      const administratorRole = fixture.makeRole({
        key: 'administrator',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(administratorRole);

      // The TOCTOU-safe path uses manager.transaction; mock the manager's QB to return count=1
      const mockQb = fixture.createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(1) });
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        delete: jest.fn(),
      };
      (fixture.userRoleRepo.manager as any).transaction = jest
        .fn()
        .mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(mockManager));

      await expect(fixture.service.revokeRole(10, 1, new Set(['system.admin']))).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when role is not manually assigned to the user', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(role);
      fixture.userRoleRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(fixture.service.revokeRole(10, 1, new Set(['resources.read']))).rejects.toThrow(ConflictException);
    });

    it('succeeds when actor has all permissions and assignment is manual', async () => {
      const role = fixture.makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      fixture.roleRepo.findOne.mockResolvedValue(role);
      fixture.userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await expect(fixture.service.revokeRole(10, 1, new Set(['resources.read']))).resolves.toBeUndefined();
      expect(fixture.userRoleRepo.delete).toHaveBeenCalled();
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
      fixture.roleRepo.findOne.mockResolvedValue(administratorRole);

      // The TOCTOU-safe path uses manager.transaction; mock the manager's QB to return count=2
      const mockQb = fixture.createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(2) });
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      };
      (fixture.userRoleRepo.manager as any).transaction = jest
        .fn()
        .mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(mockManager));

      await expect(fixture.service.revokeRole(10, 1, new Set(['system.admin']))).resolves.toBeUndefined();
      expect(mockManager.delete).toHaveBeenCalled();
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
      fixture.userRoleRepo.find.mockResolvedValue([removed]);
      fixture.userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 2, key: 'manager' }));
      fixture.userRoleRepo.findOne.mockResolvedValue(null);
      fixture.userRoleRepo.save.mockRejectedValue(new Error('write failed'));

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'manager' }], SSO_TYPE, SSO_ID)).rejects.toThrow(
        'write failed',
      );
      expect(fixture.userRoleRepo.manager.transaction).toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('removes SSO roles no longer in the target set', async () => {
      const droppedRole = fixture.makeRole({ key: 'member' });
      const currentSsoRoles = [fixture.makeUserRole({ id: 5, source: UserRoleSource.SSO, role: droppedRole })];
      fixture.userRoleRepo.find.mockResolvedValue(currentSsoRoles);
      fixture.userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      // target set is empty — member should be removed
      await fixture.service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(fixture.userRoleRepo.delete).toHaveBeenCalledWith({ id: 5 });
    });

    it('skips administrator role removal when it is the last administrator', async () => {
      const administratorRole = fixture.makeRole({ key: 'administrator' });
      const currentSsoRoles = [fixture.makeUserRole({ id: 7, source: UserRoleSource.SSO, role: administratorRole })];
      fixture.userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      // otherAdministratorCount = 0 — this is the last administrator, skip removal
      const mockQb = fixture.createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(0) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      // target set does not include 'administrator'
      await fixture.service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(fixture.userRoleRepo.delete).not.toHaveBeenCalled();
    });

    it('removes administrator role when other administrators exist', async () => {
      const administratorRole = fixture.makeRole({ key: 'administrator' });
      const currentSsoRoles = [fixture.makeUserRole({ id: 7, source: UserRoleSource.SSO, role: administratorRole })];
      fixture.userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      // Another administrator exists
      const mockQb = fixture.createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(1) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);
      fixture.userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await fixture.service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(fixture.userRoleRepo.delete).toHaveBeenCalledWith({ id: 7 });
    });

    it('adds new roles that are in the target set but not yet assigned', async () => {
      fixture.userRoleRepo.find.mockResolvedValue([]); // no existing SSO roles
      const newRole = fixture.makeRole({ id: 3, key: 'manager' });
      fixture.roleRepo.findOne.mockResolvedValue(newRole);
      fixture.userRoleRepo.findOne.mockResolvedValue(null); // not already present
      const saved = fixture.makeUserRole({ roleId: 3, source: UserRoleSource.SSO });
      fixture.userRoleRepo.save.mockResolvedValue(saved);

      await fixture.service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'idp_manager' }], SSO_TYPE, SSO_ID);

      expect(fixture.userRoleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 3, source: UserRoleSource.SSO, externalValue: 'idp_manager' }),
      );
      expect(fixture.userRoleRepo.save).toHaveBeenCalled();
    });

    it('refreshes externalValue on an existing SSO assignment when it changes', async () => {
      const existingRole = fixture.makeRole({ key: 'manager' });
      const currentSsoRoles = [
        fixture.makeUserRole({ id: 9, source: UserRoleSource.SSO, role: existingRole, externalValue: 'old_group' }),
      ];
      fixture.userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      await fixture.service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'new_group' }], SSO_TYPE, SSO_ID);

      expect(fixture.userRoleRepo.update).toHaveBeenCalledWith({ id: 9 }, { externalValue: 'new_group' });
      expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('skips adding a role when already present in currentSsoRoles', async () => {
      const existingRole = fixture.makeRole({ key: 'manager' });
      const currentSsoRoles = [fixture.makeUserRole({ source: UserRoleSource.SSO, role: existingRole })];
      fixture.userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      await fixture.service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'idp_manager' }], SSO_TYPE, SSO_ID);

      expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('handles unique constraint violation (23505) gracefully when adding', async () => {
      fixture.userRoleRepo.find.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.roleRepo.findOne.mockResolvedValue(newRole);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);

      const uniqueViolation = Object.assign(new QueryFailedError('', [], new Error('unique violation')), {
        code: '23505',
      });
      fixture.userRoleRepo.save.mockRejectedValue(uniqueViolation);

      // Should NOT throw
      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).resolves.toEqual({
        added: [],
        removed: [],
        updated: [],
      });
    });

    it('handles unique constraint violation (SQLITE_CONSTRAINT) gracefully when adding', async () => {
      fixture.userRoleRepo.find.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.roleRepo.findOne.mockResolvedValue(newRole);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);

      const sqliteViolation = Object.assign(new QueryFailedError('', [], new Error('UNIQUE constraint failed')), {
        code: 'SQLITE_CONSTRAINT',
      });
      fixture.userRoleRepo.save.mockRejectedValue(sqliteViolation);

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).resolves.toEqual({
        added: [],
        removed: [],
        updated: [],
      });
    });

    it('rethrows non-unique SQLITE_CONSTRAINT errors (e.g. FK violation)', async () => {
      fixture.userRoleRepo.find.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.roleRepo.findOne.mockResolvedValue(newRole);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);

      const fkError = Object.assign(new QueryFailedError('', [], new Error('FOREIGN KEY constraint failed')), {
        code: 'SQLITE_CONSTRAINT',
      });
      fixture.userRoleRepo.save.mockRejectedValue(fkError);

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).rejects.toThrow(
        QueryFailedError,
      );
    });

    it('rethrows non-unique-constraint errors', async () => {
      fixture.userRoleRepo.find.mockResolvedValue([]);
      const newRole = fixture.makeRole({ id: 4, key: 'editor' });
      fixture.roleRepo.findOne.mockResolvedValue(newRole);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);

      const otherError = Object.assign(new QueryFailedError('', [], new Error('other db error')), {
        code: '42P01',
      });
      fixture.userRoleRepo.save.mockRejectedValue(otherError);

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).rejects.toThrow(
        QueryFailedError,
      );
    });

    it('silently skips roles that do not exist in the database', async () => {
      fixture.userRoleRepo.find.mockResolvedValue([]);
      fixture.roleRepo.findOne.mockResolvedValue(null); // unknown role key

      await expect(fixture.service.syncSsoRoles(10, [{ roleKey: 'unknown-role' }], SSO_TYPE, SSO_ID)).resolves.toEqual({
        added: [],
        removed: [],
        updated: [],
      });
      expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────── assignDefaultRoles ─────────────────────────────

  describe('assignDefaultRoles', () => {
    it('assigns all isDefault roles that are not yet assigned', async () => {
      const defaultRoles = [
        fixture.makeRole({ id: 1, key: 'basic', isDefault: true }),
        fixture.makeRole({ id: 2, key: 'reader', isDefault: true }),
      ];
      fixture.roleRepo.find.mockResolvedValue(defaultRoles);
      fixture.userRoleRepo.findOne.mockResolvedValue(null); // neither already assigned
      const saved = fixture.makeUserRole();
      fixture.userRoleRepo.save.mockResolvedValue(saved);

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.userRoleRepo.save).toHaveBeenCalledTimes(2);
    });

    it('skips roles that are already assigned', async () => {
      const defaultRoles = [fixture.makeRole({ id: 1, key: 'basic', isDefault: true })];
      fixture.roleRepo.find.mockResolvedValue(defaultRoles);
      fixture.userRoleRepo.findOne.mockResolvedValue(fixture.makeUserRole()); // already exists

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('does nothing when there are no default roles', async () => {
      fixture.roleRepo.find.mockResolvedValue([]);

      await fixture.service.assignDefaultRoles(10);

      expect(fixture.userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('does not invalidate before a caller-owned transaction commits', async () => {
      fixture.roleRepo.find.mockResolvedValue([fixture.makeRole({ id: 1, key: 'basic', isDefault: true })]);
      fixture.userRoleRepo.findOne.mockResolvedValue(null);
      const manager = {
        getRepository: jest.fn((entity) => (entity === Role ? fixture.roleRepo : fixture.userRoleRepo)),
      };

      await fixture.service.assignDefaultRoles(10, manager as any);

      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getRolesWithUsage', () => {
    it('merges user counts into roles', async () => {
      fixture.roleRepo.find.mockResolvedValue([fixture.makeRole({ id: 1 }), fixture.makeRole({ id: 2, key: 'other' })]);
      const mockQb = fixture.createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([{ roleId: 1, userCount: '3' }]),
      });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await fixture.service.getRolesWithUsage();

      expect(result.find((r) => r.id === 1)?.userCount).toBe(3);
      expect(result.find((r) => r.id === 2)?.userCount).toBe(0);
    });
  });

  describe('createRole', () => {
    it('creates a custom role with a slugified key and permissions', async () => {
      fixture.permissionRepo.find.mockResolvedValue([fixture.makePermission('resources.read')]);
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 42, key: 'workshop-supervisor' }));

      await fixture.service.createRole(
        { name: 'Workshop Supervisor!', description: 'desc', permissionKeys: ['resources.read'] },
        new Set(['resources.read']),
      );

      expect(fixture.roleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'workshop-supervisor', name: 'Workshop Supervisor!', isSystemManaged: false }),
      );
      expect(fixture.rolePermissionRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: 42, permissionKey: 'resources.read' }),
      ]);
    });

    it('appends a numeric suffix when the key is already taken', async () => {
      fixture.permissionRepo.find.mockResolvedValue([]);
      (fixture.roleRepo.existsBy as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 42 }));

      await fixture.service.createRole({ name: 'User' }, new Set());

      expect(fixture.roleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'user-2' }));
    });

    it('rejects unknown permission keys', async () => {
      fixture.permissionRepo.find.mockResolvedValue([]);

      await expect(
        fixture.service.createRole({ name: 'X', permissionKeys: ['not.a.permission'] }, new Set(['not.a.permission'])),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects granting permissions the actor does not have', async () => {
      fixture.permissionRepo.find.mockResolvedValue([fixture.makePermission('billing.manage')]);

      await expect(
        fixture.service.createRole({ name: 'X', permissionKeys: ['billing.manage'] }, new Set(['resources.read'])),
      ).rejects.toThrow(ForbiddenException);
      expect(fixture.roleRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('throws NotFoundException for a missing role', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(null);

      await expect(fixture.service.updateRole(99, { name: 'X' }, new Set())).rejects.toThrow(NotFoundException);
    });

    it('rejects modification of system-managed roles', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ isSystemManaged: true }));

      await expect(fixture.service.updateRole(1, { name: 'X' }, new Set())).rejects.toThrow(ForbiddenException);
    });

    it('updates name and description without touching permissions', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 5 }));

      await fixture.service.updateRole(5, { name: ' New Name ', description: 'new desc' }, new Set());

      expect(fixture.roleRepo.save).toHaveBeenCalledWith({ id: 5, name: 'New Name', description: 'new desc' });
      expect(fixture.roleRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects adding permissions the actor does not have', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 5, rolePermissions: [] }));
      fixture.permissionRepo.find.mockResolvedValue([fixture.makePermission('billing.manage')]);

      await expect(
        fixture.service.updateRole(5, { permissionKeys: ['billing.manage'] }, new Set(['resources.read'])),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects removing permissions the actor does not have', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'billing.manage' } as RolePermission],
        }),
      );
      fixture.permissionRepo.find.mockResolvedValue([]);

      await expect(fixture.service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks a permission removal that would leave no administrator-equivalent user', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission],
        }),
      );
      fixture.permissionRepo.count.mockResolvedValue(16);
      const qbBefore = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 1 }]) });
      const qbAfter = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) });
      fixture.roleManager.createQueryBuilder.mockReturnValueOnce(qbBefore as any).mockReturnValueOnce(qbAfter as any);

      await expect(fixture.service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows a permission removal when administrator-equivalence is preserved', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission],
        }),
      );
      fixture.permissionRepo.count.mockResolvedValue(16);
      const qbBefore = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 1 }]) });
      const qbAfter = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 1 }]) });
      fixture.roleManager.createQueryBuilder.mockReturnValueOnce(qbBefore as any).mockReturnValueOnce(qbAfter as any);

      await fixture.service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']));

      expect(fixture.roleManager.delete).toHaveBeenCalledWith(RolePermission, expect.objectContaining({ roleId: 5 }));
    });

    it('applies permission set changes in a transaction', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission],
        }),
      );
      fixture.permissionRepo.find.mockResolvedValue([fixture.makePermission('users.read')]);

      await fixture.service.updateRole(
        5,
        { permissionKeys: ['users.read'] },
        new Set(['users.read', 'resources.read']),
      );

      expect(fixture.roleManager.delete).toHaveBeenCalledWith(RolePermission, expect.objectContaining({ roleId: 5 }));
      expect(fixture.roleManager.save).toHaveBeenCalledWith(
        RolePermission,
        expect.objectContaining({ roleId: 5, permissionKey: 'users.read' }),
      );
    });
  });

  describe('deleteRole', () => {
    const setAdministratorEquivalentCounts = (withoutRole: number, total: number) => {
      // countAdministratorEquivalentUsers is called twice: first excluding the role, then overall
      fixture.permissionRepo.count.mockResolvedValue(16);
      const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: i + 1 }));
      const qb1 = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue(rows(withoutRole)) });
      const qb2 = fixture.createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue(rows(total)) });
      fixture.userRoleRepo.createQueryBuilder.mockReturnValueOnce(qb1 as any).mockReturnValueOnce(qb2 as any);
    };

    it('throws NotFoundException for a missing role', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(null);

      await expect(fixture.service.deleteRole(99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('rejects deletion of system-managed roles', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ isSystemManaged: true }));

      await expect(fixture.service.deleteRole(1, new Set())).rejects.toThrow(ForbiddenException);
    });

    it('rejects deleting a role whose permissions exceed the actor', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(
        fixture.makeRole({
          id: 5,
          rolePermissions: [{ roleId: 5, permissionKey: 'billing.manage' } as RolePermission],
        }),
      );

      await expect(fixture.service.deleteRole(5, new Set(['resources.read']))).rejects.toThrow(ForbiddenException);
      expect(fixture.roleManager.delete).not.toHaveBeenCalled();
    });

    it('rejects reassigning to the role being deleted', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 5 }));

      await expect(fixture.service.deleteRole(5, new Set(), 5)).rejects.toThrow(BadRequestException);
    });

    it('rejects reassignment to a role whose permissions exceed the actor', async () => {
      fixture.roleRepo.findOne.mockResolvedValueOnce(fixture.makeRole({ id: 5 })).mockResolvedValueOnce(
        fixture.makeRole({
          id: 6,
          rolePermissions: [{ roleId: 6, permissionKey: 'billing.manage' } as RolePermission],
        }),
      );

      await expect(fixture.service.deleteRole(5, new Set(['resources.read']), 6)).rejects.toThrow(ForbiddenException);
    });

    it('blocks deletion that would leave no administrator-equivalent user', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 5 }));
      setAdministratorEquivalentCounts(0, 1);

      await expect(fixture.service.deleteRole(5, new Set())).rejects.toThrow(ForbiddenException);
      expect(fixture.roleManager.delete).not.toHaveBeenCalled();
    });

    it('deletes a custom role when administrator-equivalence is preserved', async () => {
      fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 5 }));
      setAdministratorEquivalentCounts(1, 1);

      await fixture.service.deleteRole(5, new Set());

      expect(fixture.roleManager.delete).toHaveBeenCalledWith(Role, { id: 5 });
    });

    it('reassigns affected users to the target role before deleting', async () => {
      fixture.roleRepo.findOne
        .mockResolvedValueOnce(fixture.makeRole({ id: 5 }))
        .mockResolvedValueOnce(fixture.makeRole({ id: 6, rolePermissions: [] }));
      setAdministratorEquivalentCounts(1, 1);
      fixture.roleManager.find.mockResolvedValue([
        fixture.makeUserRole({ userId: 10, roleId: 5 }),
        fixture.makeUserRole({ id: 2, userId: 11, roleId: 5 }),
      ]);
      fixture.roleManager.findOne.mockResolvedValue(null);

      await fixture.service.deleteRole(5, new Set(), 6);

      expect(fixture.roleManager.save).toHaveBeenCalledTimes(2);
      expect(fixture.roleManager.save).toHaveBeenCalledWith(
        UserRole,
        expect.objectContaining({ userId: 10, roleId: 6, source: UserRoleSource.MANUAL }),
      );
      expect(fixture.roleManager.delete).toHaveBeenCalledWith(Role, { id: 5 });
    });
  });
});
