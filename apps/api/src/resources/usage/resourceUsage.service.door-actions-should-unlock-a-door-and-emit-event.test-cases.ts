import { ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldUnlockADoorAndEmitEvent(scope: DoorActionsTestScope): void {
  it('should unlock a door and emit event', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.doorResource);
    const saved = {
      id: 101,
      resourceId: 10,
      userId: 5,
      usageAction: ResourceUsageAction.DoorUnlock,
      startTime: new Date(),
      startNotes: null,
      endTime: new Date(),
      endNotes: null,
    } as unknown as ResourceUsage;
    scope.resourceUsageRepository.save.mockResolvedValue(saved);
    scope.resourceUsageRepository.findOne.mockResolvedValue(saved);

    const result = await scope.service.unlockDoor(10, scope.mockUser);

    expect(result).toBe(saved);
    expect(scope.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );

    const emitted = scope.eventEmitter.emitAsync.mock.calls[0];
    const payload = emitted[1] as ResourceSessionStartedEvent;
    expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
    expect(payload.usage).toMatchObject({
      id: 101,
      usageAction: ResourceUsageAction.DoorUnlock,
      resourceId: 10,
      userId: 5,
    });
  });
}
