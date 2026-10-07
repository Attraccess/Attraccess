import { ResourceUsage, ResourceUsageAction, User, Project } from '@attraccess/database-entities';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';
import { IsNull } from 'typeorm';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { NotFoundException } from '@nestjs/common';

export function registerAssignsAndClearsACompletedSessionProjectThroughTheOwningUserCases(
  fixture: ReturnType<typeof registerResourceUsageServiceFixture>,
) {
  it('assigns and clears a completed session project through the owning user', async () => {
    const usage = {
      id: 8,
      resourceId: 1,
      userId: 7,
      endTime: new Date(),
      usageAction: ResourceUsageAction.Usage,
    } as ResourceUsage;
    fixture.resourceUsageRepository.findOne.mockResolvedValue(usage);
    const user = { id: 7 } as User;
    expect(await fixture.service.updateSessionProject(1, 8, user, { projectId: 9 })).toBe(usage);
    expect(fixture.projectsService.findOneById).toHaveBeenCalledWith(7, 9);
    expect(fixture.resourceUsageRepository.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 9 }));
    await fixture.service.updateSessionProject(1, 8, user, { projectId: null });
    expect(fixture.resourceUsageRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: null, project: null }),
    );
  });
}

export function registerGetActiveSessionCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('getActiveSession', () => {
    it('should return active session when it exists', async () => {
      const mockActiveSession = { id: 1, resourceId: 1, userId: 1, user: { id: 1 } as User } as ResourceUsage;
      fixture.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

      const result = await fixture.service.getActiveSession(1, true);

      expect(result).toBe(mockActiveSession);
      expect(fixture.resourceUsageRepository.findOne).toHaveBeenCalledWith({
        where: {
          resourceId: 1,
          endTime: IsNull(),
          isFinalized: true,
          lifecyclePending: false,
        },
        relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
      });
    });

    it('should return null when no active session exists', async () => {
      fixture.resourceUsageRepository.findOne.mockResolvedValue(null);

      const result = await fixture.service.getActiveSession(1, true);

      expect(result).toBeNull();
    });
  });
}

export function registerGetSessionDetailsCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('getSessionDetails', () => {
    const requester = { id: 1, effectivePermissions: new Set<string>() } as AuthenticatedUser;

    it('loads the requested visible session and its usage details for the owner', async () => {
      const usage = { id: 8, userId: 1, resourceId: 5 } as ResourceUsage;
      fixture.resourceUsageRepository.findOne.mockResolvedValue(usage);
      expect(await fixture.service.getSessionDetails(5, 8, requester)).toBe(usage);
      expect(fixture.resourceUsageRepository.findOne).toHaveBeenCalledWith({
        where: { id: 8, resourceId: 5, lifecyclePending: false },
        relations: expect.arrayContaining(['project', 'supervisorUser', 'formSubmissions.form']),
      });
      expect(fixture.projectsService.findOneById).not.toHaveBeenCalled();
    });

    it('allows resource managers to view another user’s session', async () => {
      fixture.resourceUsageRepository.findOne.mockResolvedValue({ id: 8, userId: 2 } as ResourceUsage);
      expect(
        await fixture.service.getSessionDetails(5, 8, {
          ...requester,
          effectivePermissions: new Set(['resources.update']),
        }),
      ).toEqual({ id: 8, userId: 2 });
      expect(fixture.projectsService.findOneById).not.toHaveBeenCalled();
    });

    it('requires project access before returning another member’s usage', async () => {
      const usage = { id: 8, userId: 2, projectId: 3 } as ResourceUsage;
      fixture.resourceUsageRepository.findOne.mockResolvedValue(usage);
      fixture.projectsService.findOneById.mockResolvedValue({ id: 3 } as Project);
      expect(await fixture.service.getSessionDetails(5, 8, requester)).toBe(usage);
      expect(fixture.projectsService.findOneById).toHaveBeenCalledWith(1, 3);
      fixture.projectsService.findOneById.mockRejectedValue(new NotFoundException('Project not found'));
      await expect(fixture.service.getSessionDetails(5, 8, requester)).rejects.toThrow(NotFoundException);
    });

    it.each([null, { id: 8, userId: 2, projectId: null }])(
      'rejects missing or inaccessible sessions (%s)',
      async (usage) => {
        fixture.resourceUsageRepository.findOne.mockResolvedValue(usage as ResourceUsage);
        await expect(fixture.service.getSessionDetails(5, 8, requester)).rejects.toThrow(NotFoundException);
      },
    );
  });
}

export function registerRejectsInvalidOrUnauthorizedProjectAssignmentsWithoutWritingTheSessionCases(
  fixture: ReturnType<typeof registerResourceUsageServiceFixture>,
) {
  it('rejects invalid or unauthorized project assignments without writing the session', async () => {
    const user = { id: 7 } as User;
    fixture.resourceUsageRepository.findOne.mockResolvedValue(null);
    await expect(fixture.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('not found');
    const usage = {
      id: 8,
      resourceId: 1,
      userId: 7,
      endTime: null,
      usageAction: ResourceUsageAction.Usage,
    } as ResourceUsage;
    fixture.resourceUsageRepository.findOne.mockResolvedValue(usage);
    await expect(fixture.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('still active');
    usage.endTime = new Date();
    usage.usageAction = ResourceUsageAction.DoorUnlock;
    await expect(fixture.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow(
      'Only usage sessions',
    );
    usage.usageAction = ResourceUsageAction.Usage;
    usage.userId = 99;
    await expect(fixture.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('not authorized');
    usage.userId = 7;
    await expect(fixture.service.updateSessionProject(1, 8, user, {} as never)).rejects.toThrow('required');
    expect(fixture.resourceUsageRepository.save).not.toHaveBeenCalled();
  });
}
