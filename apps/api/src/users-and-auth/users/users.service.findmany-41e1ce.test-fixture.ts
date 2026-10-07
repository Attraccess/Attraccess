import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';

export function registerFindmanyScopeFixture(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  return {
    get fixture() {
      return fixture;
    },
  };
}
