/* eslint-disable @typescript-eslint/no-explicit-any */
import { Role, UserRoleSource } from '@attraccess/database-entities';
import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

export function registerAssignDefaultRolesCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}

export function registerAssignRoleCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}

export function registerAssignsARoleByKeyIdempotentlyAndSupportsAContainingTransactionCases(
  fixture: ReturnType<typeof registerRbacServiceFixture>,
) {
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
}

export function registerCreateRoleCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}

export function registerDetectsTheLastActiveAdministratorAndHandlesAbsentRoleAssignmentsCases(
  fixture: ReturnType<typeof registerRbacServiceFixture>,
) {
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
}
