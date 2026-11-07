import { ResourceMaintenance, ResourceUsage, SupervisionMode, User } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { createResourceUsageServiceFixture } from '../../resources/usage/sessions/fixtures/service.test-fixture';
import { resetTestFixture } from '../../resources/usage/sessions/fixtures/setup.test-fixture';
import { createResourceAccessContext, ResourceAccessDeps } from './resource-access';

/**
 * The usage service is the real ResourceUsageService (only its collaborators are mocked), so the
 * introduction, group introduction and retraining rules exercised here are core's, not a copy.
 */
describe('plugin resourceAccess', () => {
  const scope = createResourceUsageServiceFixture();
  const user = { id: 5 } as User;
  const resources = new Map<number, { id: number; supervisionMode: SupervisionMode }>();
  let permissions: Set<string>;
  let maintenance: jest.Mocked<ResourceAccessDeps['maintenance']>;
  let access: ReturnType<typeof createResourceAccessContext>;

  beforeEach(async () => {
    await resetTestFixture(scope as never);
    permissions = new Set();
    resources.clear();
    resources.set(1, { id: 1, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED });
    scope.mockRbacService.getEffectivePermissions.mockImplementation(async () => permissions);
    scope.mockResourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
    scope.mockResourceIntroducersService.canMaintain.mockResolvedValue(false);
    scope.mockResourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.mockResourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
    scope.mockResourceRetrainingService.isResourceIntroductionBlocked.mockResolvedValue(false);
    scope.mockResourceRetrainingService.isGroupIntroductionBlocked.mockResolvedValue(false);
    scope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
      blocksAccess: false,
      dueAt: null,
    });
    maintenance = {
      getMaintenanceManagedResourceIds: jest.fn(),
      findOverlappingMaintenances: jest.fn(),
    };
    access = createResourceAccessContext(() => ({
      usage: scope.service,
      introducers: scope.mockResourceIntroducersService as never,
      maintenance,
      rbac: scope.mockRbacService as never,
      findUser: async (id) => (id === user.id ? user : null),
      findResource: async (id) => resources.get(id) ?? null,
      listResourceIds: async () => [...resources.keys()],
    }));
  });

  describe('canStart', () => {
    it('denies a user without any introduction', async () => {
      await expect(access.canStart(user.id, 1)).resolves.toEqual({
        allowed: false,
        requiresSupervision: false,
        supervisionAllowed: false,
      });
    });

    it('allows a user with a valid direct introduction', async () => {
      scope.mockResourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true, requiresSupervision: false });
    });

    it('allows a user whose group introduction is valid', async () => {
      scope.mockResourceGroupsService.getGroupsOfResource.mockResolvedValue([{ id: 9 } as never]);
      scope.mockResourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true });
      expect(scope.mockResourceGroupsIntroductionsService.hasValidIntroduction).toHaveBeenCalledWith(
        { groupId: 9, userId: user.id },
        undefined,
      );
    });

    it('blocks a valid direct introduction that is pending retraining', async () => {
      scope.mockResourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      scope.mockResourceRetrainingService.isResourceIntroductionBlocked.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: false });
    });

    it('blocks a valid group introduction that is pending retraining', async () => {
      scope.mockResourceGroupsService.getGroupsOfResource.mockResolvedValue([{ id: 9 } as never]);
      scope.mockResourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(true);
      scope.mockResourceRetrainingService.isGroupIntroductionBlocked.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: false });
    });

    it('allows introducers, maintainers and resource managers', async () => {
      scope.mockResourceIntroducersService.canMaintain.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true });
      scope.mockResourceIntroducersService.canMaintain.mockResolvedValue(false);
      permissions = new Set(['resources.update']);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true });
    });

    it('lets a non-introduced user start supervised when supervision is allowed', async () => {
      resources.set(1, { id: 1, supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      await expect(access.canStart(user.id, 1)).resolves.toEqual({
        allowed: false,
        requiresSupervision: true,
        supervisionAllowed: true,
      });
    });

    it('lets an introduced user start alone when supervision is merely allowed', async () => {
      resources.set(1, { id: 1, supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      scope.mockResourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toEqual({
        allowed: true,
        requiresSupervision: false,
        supervisionAllowed: true,
      });
    });

    it('requires supervision for everyone when the resource mandates it', async () => {
      resources.set(1, { id: 1, supervisionMode: SupervisionMode.SUPERVISION_REQUIRED });
      scope.mockResourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toEqual({
        allowed: false,
        requiresSupervision: true,
        supervisionAllowed: true,
      });
    });

    it('reports unknown users as unable to start and unknown resources as not found', async () => {
      await expect(access.canStart(404, 1)).resolves.toEqual({
        allowed: false,
        requiresSupervision: false,
        supervisionAllowed: false,
      });
      await expect(access.canStart(user.id, 99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('permissions and roles', () => {
    it('answers hasPermission from the user effective permissions', async () => {
      permissions = new Set(['resources.update']);
      await expect(access.hasPermission(user.id, 'resources.update')).resolves.toBe(true);
      await expect(access.hasPermission(user.id, 'users.manage')).resolves.toBe(false);
    });

    it('lets canMaintain pass for the maintenance permission or an introducer/maintainer role incl. groups', async () => {
      await expect(access.canMaintain(user.id, 1)).resolves.toBe(false);
      permissions = new Set(['resources.maintenance.manage']);
      await expect(access.canMaintain(user.id, 1)).resolves.toBe(true);
      permissions = new Set();
      scope.mockResourceIntroducersService.canMaintain.mockResolvedValue(true);
      await expect(access.canMaintain(user.id, 1)).resolves.toBe(true);
      expect(scope.mockResourceIntroducersService.canMaintain).toHaveBeenCalledWith(1, user.id, true);
    });
  });

  describe('resource lists', () => {
    beforeEach(() => {
      resources.set(2, { id: 2, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED });
      resources.set(3, { id: 3, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED });
    });

    it('lists resources the user is introduced to, excluding retraining-blocked ones', async () => {
      scope.mockResourceIntroductionService.hasValidIntroduction.mockImplementation(async (id: number) => id !== 3);
      scope.mockResourceRetrainingService.isResourceIntroductionBlocked.mockImplementation(
        async (id: number) => id === 2,
      );
      await expect(access.listResourceIdsIntroduced(user.id)).resolves.toEqual([1]);
    });

    it('includes resources reachable through a valid group introduction', async () => {
      scope.mockResourceGroupsService.getGroupsOfResource.mockImplementation(async (id: number) =>
        id === 3 ? [{ id: 9 } as never] : [],
      );
      scope.mockResourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.listResourceIdsIntroduced(user.id)).resolves.toEqual([3]);
    });

    it('returns nothing for unknown users', async () => {
      await expect(access.listResourceIdsIntroduced(404)).resolves.toEqual([]);
      await expect(access.listResourceIdsMaintained(404)).resolves.toEqual([]);
    });

    it('lists maintained resources through the core bulk lookup', async () => {
      maintenance.getMaintenanceManagedResourceIds.mockResolvedValue(new Set([3, 1]));
      await expect(access.listResourceIdsMaintained(user.id)).resolves.toEqual([1, 3]);
      expect(maintenance.getMaintenanceManagedResourceIds).toHaveBeenCalledWith(user, [1, 2, 3]);
    });
  });

  describe('maintenance windows and sessions', () => {
    it('maps overlapping maintenances, keeping open-ended windows open', async () => {
      const from = new Date('2030-01-01T00:00:00Z');
      const to = new Date('2030-01-02T00:00:00Z');
      maintenance.findOverlappingMaintenances.mockResolvedValue([
        {
          id: 1,
          resourceId: 1,
          startTime: new Date('2029-12-31T00:00:00Z'),
          endTime: null,
          reason: 'open',
        } as ResourceMaintenance,
        {
          id: 2,
          resourceId: 1,
          startTime: new Date('2030-01-01T10:00:00Z'),
          endTime: new Date('2030-01-01T12:00:00Z'),
          reason: undefined,
        } as ResourceMaintenance,
      ]);
      await expect(access.getMaintenanceWindows(1, from, to)).resolves.toEqual([
        { maintenanceId: 1, resourceId: 1, startTime: new Date('2029-12-31T00:00:00Z'), endTime: null, reason: 'open' },
        {
          maintenanceId: 2,
          resourceId: 1,
          startTime: new Date('2030-01-01T10:00:00Z'),
          endTime: new Date('2030-01-01T12:00:00Z'),
          reason: null,
        },
      ]);
      expect(maintenance.findOverlappingMaintenances).toHaveBeenCalledWith(1, from, to);
    });

    it('maps running sessions', async () => {
      const startTime = new Date('2030-01-01T10:00:00Z');
      jest
        .spyOn(scope.service, 'getActiveSessionsForResource')
        .mockResolvedValue([{ id: 8, userId: 5, startTime, resourceId: 1 } as ResourceUsage]);
      await expect(access.getActiveSessions(1)).resolves.toEqual([{ usageId: 8, userId: 5, startTime }]);
    });
  });
});
