import { Resource } from '@attraccess/database-entities';
import { DoorActionsTestScope } from './resourceUsage.service.spec';
export function registerDoorActionsShouldThrowWhenUnlatchingUnsupportedDoor(scope: DoorActionsTestScope): void {
  it('should throw when unlatching unsupported door', async () => {
    scope.resourceRepository.findOne.mockResolvedValue({
      ...scope.doorResource,
      separateUnlockAndUnlatch: false,
    } as Resource);

    await expect(scope.service.unlatchDoor(10, scope.mockUser)).rejects.toThrow(
      'Door (ID: 10, Name: Front Door) does not support unlatching',
    );
  });
}
