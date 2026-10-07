import { ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorLock(scope: DoorActionsTestScope): void {
  it('should propagate emitAsync errors from door lock', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.doorResource);
    const saved = {
      id: 100,
      resourceId: 10,
      userId: 5,
      usageAction: ResourceUsageAction.DoorLock,
      startTime: new Date(),
      endTime: new Date(),
    } as unknown as ResourceUsage;
    scope.resourceUsageRepository.save.mockResolvedValue(saved);
    scope.resourceUsageRepository.findOne.mockResolvedValue(saved);
    scope.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

    await expect(scope.service.lockDoor(10, scope.mockUser)).rejects.toThrow('Flow error');
  });
}
