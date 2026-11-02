import { NotFoundException } from '@nestjs/common';
import { ResourceUsage, SupervisionMode } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceActivityVisibility } from '../../../settings/constants';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { ResourceUsageController } from './resource-usage.controller';
import { createResourceUsageServiceFixture } from './fixtures/service.test-fixture';
import { resetTestFixture } from './fixtures/setup.test-fixture';

/**
 * The real usage service (its canControllResource, fed with introduction, group, introducer and maintainer rows from
 * fake collaborators), the real visibility service and the real controller, to pin down who reads which sessions.
 */
describe('who reads other people’s sessions', () => {
  const scope = createResourceUsageServiceFixture();
  const MACHINE = 1;
  const SUPERVISED = 2;
  const OTHER = 99;

  let mode: ResourceActivityVisibility;
  let controller: ResourceUsageController;

  const operatorSession = (resourceId = MACHINE) =>
    ({
      id: 5,
      resourceId,
      userId: OTHER,
      user: { id: OTHER, username: 'operator' },
      startNotes: 'secret notes',
      startTime: new Date('2026-10-30T10:00:00Z'),
      endTime: null,
      usageAction: 'usage',
      projectId: null,
    }) as unknown as ResourceUsage;

  type Grant = 'direct' | 'group' | 'introducer' | 'maintainer' | 'blocked' | 'none';
  const grants = (grant: Grant) => {
    scope.mockResourceIntroductionService.hasValidIntroduction.mockResolvedValue(
      grant === 'direct' || grant === 'blocked',
    );
    scope.mockResourceRetrainingService.isResourceIntroductionBlocked.mockResolvedValue(grant === 'blocked');
    scope.mockResourceIntroducersService.canMaintain.mockResolvedValue(
      grant === 'introducer' || grant === 'maintainer',
    );
    scope.mockResourceGroupsService.getGroupsOfResource.mockResolvedValue(grant === 'group' ? [{ id: 3 }] : []);
    scope.mockResourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(grant === 'group');
  };
  const viewer = (id: number, ...permissions: string[]) =>
    ({ id, effectivePermissions: new Set(['resources.read', ...permissions]) }) as unknown as AuthenticatedUser;
  const history = (user: AuthenticatedUser, resourceId = MACHINE, userId?: number) =>
    controller.getHistory(resourceId, { page: 1, limit: 10, userId }, { user } as never);
  const session = (user: AuthenticatedUser, resourceId = MACHINE) =>
    controller.getSession(resourceId, 5, { user } as never);

  beforeEach(async () => {
    await resetTestFixture(scope);
    mode = 'introduced';
    grants('none');
    scope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
      blocksAccess: false,
      dueAt: null,
    });
    const settings = { getResourceActivityVisibility: jest.fn(async () => mode) };
    const resources = {
      find: jest.fn(async ({ where }: { where: { id: { _value: number[] } } }) =>
        where.id._value.map((id) => ({
          id,
          supervisionMode:
            id === SUPERVISED ? SupervisionMode.SUPERVISION_ALLOWED : SupervisionMode.INTRODUCTION_REQUIRED,
        })),
      ),
    };
    controller = new ResourceUsageController(
      scope.service,
      new ResourceActivityVisibilityService(settings as never, resources as unknown as never, scope.service),
      {} as never,
      {} as never,
    );
    scope.resourceUsageRepository.findOne.mockImplementation(async ({ where }) =>
      (where as { resourceId: number }).resourceId === SUPERVISED ? operatorSession(SUPERVISED) : operatorSession(),
    );
    (scope.resourceUsageRepository as unknown as { findAndCount: jest.Mock }).findAndCount = jest.fn(
      async ({ where }) => {
        const { userId, resourceId } = where as { userId?: number; resourceId: number };
        const rows = [operatorSession(resourceId), { ...operatorSession(resourceId), id: 6, userId: 10 }];
        const matching = rows.filter((row) => userId === undefined || row.userId === userId);
        return [matching, matching.length];
      },
    );
  });

  describe.each(['all', 'introduced'] as const)('in "%s" mode', (visibility) => {
    beforeEach(() => {
      mode = visibility;
    });

    it.each<[Grant, boolean]>([
      ['direct', true],
      ['group', true],
      ['introducer', true],
      ['maintainer', true],
      ['blocked', false],
      ['none', false],
    ])('a reader with a %s grant sees everyone’s history: %s', async (grant, sees) => {
      grants(grant);
      const result = await history(viewer(10), MACHINE);
      expect(result.data.map((row) => row.id)).toEqual(sees ? [5, 6] : [6]);
      expect((await session(viewer(10)).catch((error) => error)) instanceof NotFoundException).toBe(!sees);
    });

    it.each(['resources.update', 'resources.access.manage'])(
      '%s sees everything without a grant',
      async (permission) => {
        const result = await history(viewer(10, permission));
        expect(result.data.map((row) => row.id)).toEqual([5, 6]);
        expect((await session(viewer(10, permission))).startNotes).toBe('secret notes');
      },
    );

    it('lets a project member open a project-linked session in full, whatever their access', async () => {
      scope.resourceUsageRepository.findOne.mockResolvedValue({ ...operatorSession(), projectId: 3 } as ResourceUsage);
      scope.projectsService.findOneById.mockResolvedValue({ id: 3 } as never);
      const opened = await session(viewer(10));
      expect(opened.startNotes).toBe('secret notes');
      expect(scope.projectsService.findOneById).toHaveBeenCalledWith(10, 3);
    });

    it('answers 404, not 403, to a non-member whether or not the session exists', async () => {
      scope.resourceUsageRepository.findOne.mockResolvedValue({ ...operatorSession(), projectId: 3 } as ResourceUsage);
      scope.projectsService.findOneById.mockRejectedValue(new NotFoundException('Project not found'));
      await expect(session(viewer(10))).rejects.toBeInstanceOf(NotFoundException);
      scope.resourceUsageRepository.findOne.mockResolvedValue(null);
      await expect(session(viewer(10))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('keeps a viewer’s own session readable, and their history their own', async () => {
      scope.resourceUsageRepository.findOne.mockResolvedValue({ ...operatorSession(), userId: 10 } as ResourceUsage);
      expect((await session(viewer(10))).id).toBe(5);
      expect((await history(viewer(10))).data.map((row) => row.userId)).toEqual([10]);
    });
  });

  describe('on a supervised-use machine in "introduced" mode', () => {
    it('shows someone merely eligible redacted sessions: times only, no names', async () => {
      const opened = await session(viewer(10), SUPERVISED);
      expect(opened).toEqual({
        id: 5,
        resourceId: SUPERVISED,
        usageAction: 'usage',
        startTime: new Date('2026-10-30T10:00:00Z'),
        endTime: null,
      });
      const rows = (await history(viewer(10), SUPERVISED)).data;
      expect(JSON.stringify(rows.filter((row) => row.id === 5))).not.toMatch(/operator|secret|userId/);
      expect(rows.find((row) => row.id === 6)?.userId).toBe(10);
    });

    it('still lets an eligible project member open the full session', async () => {
      scope.resourceUsageRepository.findOne.mockResolvedValue({
        ...operatorSession(SUPERVISED),
        projectId: 3,
      } as ResourceUsage);
      scope.projectsService.findOneById.mockResolvedValue({ id: 3 } as never);
      expect((await session(viewer(10), SUPERVISED)).startNotes).toBe('secret notes');
    });

    it('refuses to filter the redacted history by another user', async () => {
      await expect(history(viewer(10), SUPERVISED, OTHER)).rejects.toThrow('own usage history');
    });
  });
});
