/* eslint-disable @typescript-eslint/no-explicit-any */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolePermission } from '@attraccess/database-entities';
import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
export function registerUpdateRoleCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}
