import { ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';
export function registerResourceUsageServiceRejectsInvalidOrUnauthorizedProjectAssignmentsWithoutWritingTheSession(
  scope: ResourceUsageServiceTestScope,
): void {
  it('rejects invalid or unauthorized project assignments without writing the session', async () => {
    const user = { id: 7 } as User;
    scope.resourceUsageRepository.findOne.mockResolvedValue(null);
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('not found');
    const usage = {
      id: 8,
      resourceId: 1,
      userId: 7,
      endTime: null,
      usageAction: ResourceUsageAction.Usage,
    } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(usage);
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('still active');
    usage.endTime = new Date();
    usage.usageAction = ResourceUsageAction.DoorUnlock;
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow(
      'Only usage sessions',
    );
    usage.usageAction = ResourceUsageAction.Usage;
    usage.userId = 99;
    await expect(scope.service.updateSessionProject(1, 8, user, { projectId: 9 })).rejects.toThrow('not authorized');
    usage.userId = 7;
    await expect(scope.service.updateSessionProject(1, 8, user, {} as never)).rejects.toThrow('required');
    expect(scope.resourceUsageRepository.save).not.toHaveBeenCalled();
  });
}
