import { Resource, ResourceType, User } from '@attraccess/database-entities';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';

export function registerStartsessionScopeFixture(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  const mockUser: User = { id: 1 } as User;

  const mockResource: Resource = {
    id: 1,
    name: 'Test Resource',
    allowTakeOver: false,
    type: ResourceType.Machine,
  } as Resource;

  const mockResourceWithTakeOver: Resource = {
    id: 1,
    name: 'Test Resource',
    allowTakeOver: true,
    type: ResourceType.Machine,
  } as Resource;
  return {
    get fixture() {
      return fixture;
    },
    get mockUser() {
      return mockUser;
    },
    get mockResource() {
      return mockResource;
    },
    get mockResourceWithTakeOver() {
      return mockResourceWithTakeOver;
    },
  };
}
