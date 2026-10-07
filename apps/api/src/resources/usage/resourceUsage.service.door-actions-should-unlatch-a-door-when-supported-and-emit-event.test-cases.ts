import { Resource, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldUnlatchADoorWhenSupportedAndEmitEvent(scope: DoorActionsTestScope): void {
  it('should unlatch a door when supported and emit event', async () => {
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
      startNotes: null,
      endTime: new Date(),
      endNotes: null,
    } as unknown as ResourceUsage;
    scope.resourceUsageRepository.save.mockResolvedValue(saved);
    scope.resourceUsageRepository.findOne.mockResolvedValue(saved);

    const result = await scope.service.unlatchDoor(10, scope.mockUser);

    expect(result).toBe(saved);
    expect(scope.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );

    const emitted = scope.eventEmitter.emitAsync.mock.calls[0];
    const payload = emitted[1] as ResourceSessionStartedEvent;
    expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
    expect(payload.usage).toMatchObject({
      id: 102,
      usageAction: ResourceUsageAction.DoorUnlatch,
      resourceId: 10,
      userId: 5,
    });
  });
}
