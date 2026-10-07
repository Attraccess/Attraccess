import { Resource, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorUnlatch(scope: DoorActionsTestScope): void {
  it('should propagate emitAsync errors from door unlatch', async () => {
    scope.resourceRepository.findOne.mockResolvedValue({
      ...scope.doorResource,
      separateUnlockAndUnlatch: true,
    } as Resource);
    const saved = {
      id: 102,
      resourceId: 10,
      userId: 5,
      usageAction: ResourceUsageAction.DoorUnlatch,
      startTime: new Date(),
      endTime: new Date(),
    } as unknown as ResourceUsage;
    scope.resourceUsageRepository.save.mockResolvedValue(saved);
    scope.resourceUsageRepository.findOne.mockResolvedValue(saved);
    scope.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

    await expect(scope.service.unlatchDoor(10, scope.mockUser)).rejects.toThrow('Flow error');
  });
}
