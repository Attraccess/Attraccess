/* eslint-disable @typescript-eslint/no-explicit-any */

import { QueryFailedError } from 'typeorm';
import { UserRoleSource } from '@attraccess/database-entities';
import { registerRbacServiceFixture } from './rbac.service.rbac-service.test-fixture';
export function registerSyncSsoRolesCases(fixture: ReturnType<typeof registerRbacServiceFixture>) {
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
}
