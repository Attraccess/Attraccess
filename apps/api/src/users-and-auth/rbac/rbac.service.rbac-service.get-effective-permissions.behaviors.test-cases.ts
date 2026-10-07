/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';

export function registerGetEffectivePermissionsCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}

export function registerGetRolesWithUsageCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}

export function registerGetUserIdsWithPermissionCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}

export function registerLooksUpASingleRoleKeyWithoutLoadingRolePermissionsCases(
  fixture: ReturnType<typeof registerRbacServiceFixture>,
) {
  it('looks up a single role key without loading role permissions', async () => {
    fixture.roleRepo.findOne.mockResolvedValue(fixture.makeRole({ id: 7, key: 'operator' }));

    await expect(fixture.service.getRoleKey(7)).resolves.toBe('operator');
    expect(fixture.roleRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 }, select: { key: true } });
    expect(fixture.roleRepo.find).not.toHaveBeenCalled();
  });
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}
