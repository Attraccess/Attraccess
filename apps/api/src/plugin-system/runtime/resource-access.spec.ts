import { supervisionModesFrom } from '../../resources/usage/authorization/supervision-modes.test-fixture';
import type { PluginCoreUser } from '../persistence/plugin-host-data.port';
import { SupervisionMode } from '@attraccess/application-models';
import { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import { createFakeStoreUsageScope } from '../../resources/usage/sessions/fixtures/fake-store.test-fixture';
import { ResourceActivityVisibilityService } from '../../resources/usage/authorization/resource-activity-visibility.service';
import { createResourceAccessContext, ResourceAccessDeps } from './resource-access';

/**
 * The usage service is the real ResourceUsageService and canMaintain runs the real
 * ResourceMaintenanceService.canManageMaintenance (only their collaborators are mocked), so the
 * introduction, group introduction, retraining and maintainer rules exercised here are core's, not a copy.
 */
describe('plugin resourceAccess', () => {
  let scope: Awaited<ReturnType<typeof createFakeStoreUsageScope>>;
  const user = { id: 5 } as PluginCoreUser;
  const resources = new Map<number, { id: number; supervisionMode: SupervisionMode }>();
  let permissions: Set<string>;
  let maintainerOf: Set<number>;
  let groupMaintainer: boolean;
  let maintenance: jest.Mocked<ResourceAccessDeps['maintenance']>;
  let access: ReturnType<typeof createResourceAccessContext>;
  let activityVisibility: 'all' | 'introduced';

  beforeEach(async () => {
    scope = await createFakeStoreUsageScope();
    permissions = new Set();
    resources.clear();
    resources.set(1, { id: 1, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED });
    scope.rbac.getEffectivePermissions.mockImplementation(async () => permissions);
    scope.introductions.hasValidIntroduction.mockResolvedValue(false);
    scope.introducers.canMaintain.mockResolvedValue(false);
    scope.groupIntroductions.hasValidIntroduction.mockResolvedValue(false);
    scope.groups.getGroupsOfResource.mockResolvedValue([]);
    scope.retraining.isResourceIntroductionBlocked.mockResolvedValue(false);
    scope.retraining.isGroupIntroductionBlocked.mockResolvedValue(false);
    scope.retraining.getResourceRetrainingStatus.mockResolvedValue({
      blocksAccess: false,
      dueAt: null,
    });
    maintainerOf = new Set();
    groupMaintainer = false;
    const maintenanceService = new ResourceMaintenanceService(
      {
        lookupMaintenanceAccess: async (_userId: number, resourceId: number) =>
          maintainerOf.has(resourceId) ? 'direct' : groupMaintainer ? 'group' : 'none',
      } as never,
      null as never,
      null as never,
      scope.rbac as never,
    );
    maintenance = {
      canManageMaintenance: jest.fn((target, resourceId) =>
        maintenanceService.canManageMaintenance(target, resourceId),
      ),
      getMaintenanceManagedResourceIds: jest.fn(),
      findOverlappingMaintenances: jest.fn(),
    };
    activityVisibility = 'introduced';
    const visibility = new ResourceActivityVisibilityService(
      { getResourceActivityVisibility: async () => activityVisibility } as never,
      supervisionModesFrom(async () => [...resources.values()]) as never,
      scope.service,
    );
    access = createResourceAccessContext(() => ({
      usage: scope.service,
      visibility,
      maintenance,
      rbac: scope.rbac as never,
      findUser: async (id) => (id === user.id ? user : null),
      findResource: async (id) => resources.get(id) ?? null,
      listResourceIds: async () => [...resources.keys()],
    }));
  });

  describe('canSeeUsageAttribution', () => {
    it('follows core: full activity access sees who uses the machine', async () => {
      permissions = new Set(['resources.read']);
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canSeeUsageAttribution(user.id, 1)).resolves.toBe(true);
    });

    it('denies a reader who is not introduced to the machine', async () => {
      permissions = new Set(['resources.read']);
      await expect(access.canSeeUsageAttribution(user.id, 1)).resolves.toBe(false);
    });

    it('denies anonymous-only access on supervised machines (free or in use, no names)', async () => {
      permissions = new Set(['resources.read']);
      resources.set(1, { id: 1, supervisionMode: SupervisionMode.SUPERVISION_ALLOWED });
      await expect(access.canSeeUsageAttribution(user.id, 1)).resolves.toBe(false);
    });

    it('denies a user without read access, who sees no activity at all (hidden resource)', async () => {
      permissions = new Set();
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canSeeUsageAttribution(user.id, 1)).resolves.toBe(false);
    });

    it('allows managers and, in "all" mode, every reader', async () => {
      permissions = new Set(['resources.update']);
      await expect(access.canSeeUsageAttribution(user.id, 1)).resolves.toBe(true);
      permissions = new Set(['resources.read']);
      activityVisibility = 'all';
      await expect(access.canSeeUsageAttribution(user.id, 1)).resolves.toBe(true);
    });

    it('applies an API token scope: a token without resources.read sees no names', async () => {
      permissions = new Set(['resources.read', 'resources.update']);
      await expect(
        access.canSeeUsageAttribution({ id: user.id, effectivePermissions: ['resources.read'] }, 1),
      ).resolves.toBe(false);
      await expect(
        access.canSeeUsageAttribution({ id: user.id, effectivePermissions: ['resources.update'] }, 1),
      ).resolves.toBe(true);
    });

    it('answers false for unknown users and unknown resources, also for managers and in "all" mode', async () => {
      await expect(access.canSeeUsageAttribution(404, 1)).resolves.toBe(false);
      permissions = new Set(['resources.read', 'resources.update']);
      activityVisibility = 'all';
      await expect(access.canSeeUsageAttribution(user.id, 999)).resolves.toBe(false);
    });
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
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true, requiresSupervision: false });
    });

    it('allows a user whose group introduction is valid', async () => {
      scope.groups.getGroupsOfResource.mockResolvedValue([{ id: 9 } as never]);
      scope.groupIntroductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true });
      expect(scope.groupIntroductions.hasValidIntroduction).toHaveBeenCalledWith(
        { groupId: 9, userId: user.id },
        undefined,
      );
    });

    it('blocks a valid direct introduction that is pending retraining', async () => {
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      scope.retraining.isResourceIntroductionBlocked.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: false });
    });

    it('blocks a valid group introduction that is pending retraining', async () => {
      scope.groups.getGroupsOfResource.mockResolvedValue([{ id: 9 } as never]);
      scope.groupIntroductions.hasValidIntroduction.mockResolvedValue(true);
      scope.retraining.isGroupIntroductionBlocked.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: false });
    });

    it('allows introducers, maintainers and resource managers', async () => {
      scope.introducers.canMaintain.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true });
      scope.introducers.canMaintain.mockResolvedValue(false);
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
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toEqual({
        allowed: true,
        requiresSupervision: false,
        supervisionAllowed: true,
      });
    });

    it('requires supervision for everyone when the resource mandates it', async () => {
      resources.set(1, { id: 1, supervisionMode: SupervisionMode.SUPERVISION_REQUIRED });
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(user.id, 1)).resolves.toEqual({
        allowed: false,
        requiresSupervision: true,
        supervisionAllowed: true,
      });
    });

    it('reports unknown users and unknown resources as unable to start', async () => {
      const none = { allowed: false, requiresSupervision: false, supervisionAllowed: false };
      await expect(access.canStart(404, 1)).resolves.toEqual(none);
      await expect(access.canStart(user.id, 99)).resolves.toEqual(none);
      await expect(access.canStart({ id: user.id, effectivePermissions: [] }, 99)).resolves.toEqual(none);
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
      maintainerOf.add(1);
      await expect(access.canMaintain(user.id, 1)).resolves.toBe(true);
      maintainerOf.clear();
      groupMaintainer = true;
      await expect(access.canMaintain(user.id, 1)).resolves.toBe(true);
      await expect(access.canMaintain(404, 1)).resolves.toBe(false);
    });
  });

  describe('request principals (API-token scopes)', () => {
    const tokenWith = (...scope: string[]) => ({ id: user.id, effectivePermissions: new Set(scope) });

    beforeEach(() => {
      permissions = new Set(['resources.update', 'resources.maintenance.manage']);
    });

    it('keeps the full RBAC permissions for a plain user id', async () => {
      await expect(access.hasPermission(user.id, 'resources.update')).resolves.toBe(true);
      await expect(access.canMaintain(user.id, 1)).resolves.toBe(true);
      await expect(access.canStart(user.id, 1)).resolves.toMatchObject({ allowed: true });
    });

    it('limits permission grants to the token scope', async () => {
      const token = tokenWith('resources.read');
      await expect(access.hasPermission(token, 'resources.update')).resolves.toBe(false);
      await expect(access.hasPermission(token, 'resources.maintenance.manage')).resolves.toBe(false);
      await expect(access.canMaintain(token, 1)).resolves.toBe(false);
      await expect(access.canStart(token, 1)).resolves.toMatchObject({ allowed: false });
      await expect(access.listResourceIdsIntroduced(token)).resolves.toEqual([]);
    });

    it('hands core services the scoped user, as core does for API-token requests', async () => {
      maintenance.getMaintenanceManagedResourceIds.mockResolvedValue(new Set());
      await access.listResourceIdsMaintained(tokenWith('resources.read', 'resources.update'));
      const [scopedUser] = maintenance.getMaintenanceManagedResourceIds.mock.calls[0];
      expect(scopedUser).toMatchObject({ id: user.id });
      // Intersected with the owner's current permissions, like the session strategy does for tokens.
      expect([...(scopedUser as { effectivePermissions: Set<string> }).effectivePermissions]).toEqual([
        'resources.update',
      ]);
    });

    it('grants scoped permissions only while the user still holds them', async () => {
      const token = tokenWith('resources.update', 'resources.maintenance.manage');
      await expect(access.hasPermission(token, 'resources.update')).resolves.toBe(true);
      await expect(access.canMaintain(token, 1)).resolves.toBe(true);
      permissions = new Set();
      await expect(access.hasPermission(token, 'resources.update')).resolves.toBe(false);
      await expect(access.canMaintain(token, 1)).resolves.toBe(false);
    });

    it('still honours maintainer roles and introductions under a narrow scope', async () => {
      const token = tokenWith();
      maintainerOf.add(1);
      await expect(access.canMaintain(token, 1)).resolves.toBe(true);
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      await expect(access.canStart(token, 1)).resolves.toMatchObject({ allowed: true });
    });

    it('accepts any iterable of permissions', async () => {
      await expect(
        access.hasPermission({ id: user.id, effectivePermissions: ['resources.update'] }, 'resources.update'),
      ).resolves.toBe(true);
    });
  });

  it('exposes exactly the read-only queries and nothing that could end or change sessions', () => {
    expect(Object.keys(access).sort()).toEqual(
      [
        'canMaintain',
        'canSeeUsageAttribution',
        'canStart',
        'getActiveSessions',
        'getMaintenanceWindows',
        'hasPermission',
        'listResourceIdsIntroduced',
        'listResourceIdsMaintained',
      ].sort(),
    );
  });

  describe('resource lists', () => {
    beforeEach(() => {
      resources.set(2, { id: 2, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED });
      resources.set(3, { id: 3, supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED });
    });

    it('lists resources the user is introduced to, excluding retraining-blocked ones', async () => {
      scope.introductions.hasValidIntroduction.mockImplementation(async (id: number) => id !== 3);
      scope.retraining.isResourceIntroductionBlocked.mockImplementation(async (id: number) => id === 2);
      await expect(access.listResourceIdsIntroduced(user.id)).resolves.toEqual([1]);
    });

    it('includes resources reachable through a valid group introduction', async () => {
      scope.groups.getGroupsOfResource.mockImplementation(async (id: number) => (id === 3 ? [{ id: 9 } as never] : []));
      scope.groupIntroductions.hasValidIntroduction.mockResolvedValue(true);
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
        } as never,
        {
          id: 2,
          resourceId: 1,
          startTime: new Date('2030-01-01T10:00:00Z'),
          endTime: new Date('2030-01-01T12:00:00Z'),
          reason: undefined,
        } as never,
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
        .mockResolvedValue([{ id: 8, userId: 5, startTime, resourceId: 1 } as never]);
      await expect(access.getActiveSessions(1)).resolves.toEqual([{ usageId: 8, userId: 5, startTime }]);
    });
  });
});
