import { ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorUnlock(scope: DoorActionsTestScope): void {
  it('should propagate emitAsync errors from door unlock', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.doorResource);
    const saved = {
      id: 101,
      resourceId: 10,
      userId: 5,
      usageAction: ResourceUsageAction.DoorUnlock,
      startTime: new Date(),
      endTime: new Date(),
    } as unknown as ResourceUsage;
    scope.resourceUsageRepository.save.mockResolvedValue(saved);
    scope.resourceUsageRepository.findOne.mockResolvedValue(saved);
    scope.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

    await expect(scope.service.unlockDoor(10, scope.mockUser)).rejects.toThrow('Flow error');
  });
}
