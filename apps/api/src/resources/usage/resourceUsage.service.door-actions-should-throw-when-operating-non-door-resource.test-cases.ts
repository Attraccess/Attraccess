import { Resource, ResourceType } from '@attraccess/database-entities';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldThrowWhenOperatingNonDoorResource(scope: DoorActionsTestScope): void {
  it('should throw when operating non-door resource', async () => {
    scope.resourceRepository.findOne.mockResolvedValue({
      ...scope.doorResource,
      type: ResourceType.Machine,
    } as Resource);

    await expect(scope.service.lockDoor(10, scope.mockUser)).rejects.toThrow('Resource is not a door');
    await expect(scope.service.unlockDoor(10, scope.mockUser)).rejects.toThrow('Resource is not a door');
  });
}
