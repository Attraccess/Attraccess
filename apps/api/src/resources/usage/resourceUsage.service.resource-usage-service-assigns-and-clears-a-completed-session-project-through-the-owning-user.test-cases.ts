import { ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';
export function registerResourceUsageServiceAssignsAndClearsACompletedSessionProjectThroughTheOwningUser(
  scope: ResourceUsageServiceTestScope,
): void {
  it('assigns and clears a completed session project through the owning user', async () => {
    const usage = {
      id: 8,
      resourceId: 1,
      userId: 7,
      endTime: new Date(),
      usageAction: ResourceUsageAction.Usage,
    } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(usage);
    const user = { id: 7 } as User;
    expect(await scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).toBe(usage);
    expect(scope.projectsService.findOneById).toHaveBeenCalledWith(7, 9);
    expect(scope.resourceUsageRepository.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 9 }));
    await scope.service.updateSessionProject(1, 8, user, { projectId: null });
    expect(scope.resourceUsageRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: null, project: null }),
    );
  });
}
