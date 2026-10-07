import { Resource, ResourceType, User } from '@attraccess/database-entities';
import { registerDoorActionsShouldLockADoorAndEmitEvent } from './resourceUsage.service.door-actions-should-lock-a-door-and-emit-event.test-cases';
import { registerDoorActionsShouldUnlockADoorAndEmitEvent } from './resourceUsage.service.door-actions-should-unlock-a-door-and-emit-event.test-cases';
import { registerDoorActionsShouldUnlatchADoorWhenSupportedAndEmitEvent } from './resourceUsage.service.door-actions-should-unlatch-a-door-when-supported-and-emit-event.test-cases';
import { registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorLock } from './resourceUsage.service.door-actions-should-propagate-emit-async-errors-from-door-lock.test-cases';
import { registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorUnlock } from './resourceUsage.service.door-actions-should-propagate-emit-async-errors-from-door-unlock.test-cases';
import { registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorUnlatch } from './resourceUsage.service.door-actions-should-propagate-emit-async-errors-from-door-unlatch.test-cases';
import { registerDoorActionsShouldThrowWhenOperatingNonDoorResource } from './resourceUsage.service.door-actions-should-throw-when-operating-non-door-resource.test-cases';
import { registerDoorActionsShouldThrowWhenUnlatchingUnsupportedDoor } from './resourceUsage.service.door-actions-should-throw-when-unlatching-unsupported-door.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineDoorActionsTests(parentScope: ResourceUsageServiceTestScope) {
  const mockUser: User = { id: 5 } as User;
  const doorResource: Resource = {
    id: 10,
    name: 'Front Door',
    type: ResourceType.Door,
    allowTakeOver: false,
    separateUnlockAndUnlatch: false,
  } as Resource;
  const scope = inheritTestScope(
    {
      get resourceRepository() {
        return parentScope.resourceRepository;
      },
      set resourceRepository(value: typeof parentScope.resourceRepository) {
        parentScope.resourceRepository = value;
      },
      get doorResource() {
        return doorResource;
      },
      get resourceUsageRepository() {
        return parentScope.resourceUsageRepository;
      },
      set resourceUsageRepository(value: typeof parentScope.resourceUsageRepository) {
        parentScope.resourceUsageRepository = value;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get mockUser() {
        return mockUser;
      },
      get eventEmitter() {
        return parentScope.eventEmitter;
      },
      set eventEmitter(value: typeof parentScope.eventEmitter) {
        parentScope.eventEmitter = value;
      },
    },
    parentScope,
  );

  beforeEach(() => {
    // Common permission/maintenance happy-path mocks
    parentScope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    parentScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    parentScope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    parentScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    parentScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
  });
  registerDoorActionsShouldLockADoorAndEmitEvent(scope);

  registerDoorActionsShouldUnlockADoorAndEmitEvent(scope);

  registerDoorActionsShouldUnlatchADoorWhenSupportedAndEmitEvent(scope);

  registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorLock(scope);

  registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorUnlock(scope);

  registerDoorActionsShouldPropagateEmitAsyncErrorsFromDoorUnlatch(scope);

  registerDoorActionsShouldThrowWhenOperatingNonDoorResource(scope);

  registerDoorActionsShouldThrowWhenUnlatchingUnsupportedDoor(scope);

  return scope;
}
