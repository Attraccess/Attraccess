/* eslint-disable @typescript-eslint/no-explicit-any */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { UserPermissionsChangedEvent } from './events/user-permissions-changed.event';
import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
export function registerRevokeRoleCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}
