import { ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { IsNull } from 'typeorm';
import { GetActiveSessionTestScope } from './resourceUsage.service.spec';
export function registerGetActiveSessionShouldReturnActiveSessionWhenItExists(scope: GetActiveSessionTestScope): void {
  it('should return active session when it exists', async () => {
    const mockActiveSession = { id: 1, resourceId: 1, userId: 1, user: { id: 1 } as User } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(mockActiveSession);

    const result = await scope.service.getActiveSession(1);

    expect(result).toBe(mockActiveSession);
    expect(scope.resourceUsageRepository.findOne).toHaveBeenCalledWith({
      where: {
        resourceId: 1,
        endTime: IsNull(),
        isFinalized: true,
        lifecyclePending: false,
        usageAction: ResourceUsageAction.Usage,
      },
      order: { startTime: 'DESC', id: 'DESC' },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
  });
}
