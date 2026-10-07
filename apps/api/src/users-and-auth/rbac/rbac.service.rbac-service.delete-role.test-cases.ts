/* eslint-disable @typescript-eslint/no-explicit-any */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Role, RolePermission, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
export function registerDeleteRoleCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}
