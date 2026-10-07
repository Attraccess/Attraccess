import { ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldLockADoorAndEmitEvent(scope: DoorActionsTestScope): void {
  it('should lock a door and emit event', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.doorResource);
    const saved = {
      id: 100,
      resourceId: 10,
      userId: 5,
      usageAction: ResourceUsageAction.DoorLock,
      startTime: new Date(),
      startNotes: null,
      endTime: new Date(),
      endNotes: null,
    } as unknown as ResourceUsage;
    scope.resourceUsageRepository.save.mockResolvedValue(saved);
    scope.resourceUsageRepository.findOne.mockResolvedValue(saved);

    const result = await scope.service.lockDoor(10, scope.mockUser);

    expect(result).toBe(saved);
    expect(scope.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );

    const emitted = scope.eventEmitter.emitAsync.mock.calls[0];
    const payload = emitted[1] as ResourceSessionStartedEvent;
    expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
    expect(payload.usage).toMatchObject({
      id: 100,
      usageAction: ResourceUsageAction.DoorLock,
      resourceId: 10,
      userId: 5,
    });
  });
}
