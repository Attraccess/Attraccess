import { registerGetActiveSessionShouldReturnActiveSessionWhenItExists } from './resourceUsage.service.get-active-session-should-return-active-session-when-it-exists.test-cases';
import { registerGetActiveSessionShouldReturnNullWhenNoActiveSessionExists } from './resourceUsage.service.get-active-session-should-return-null-when-no-active-session-exists.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineGetActiveSessionTests(parentScope: ResourceUsageServiceTestScope) {
  const scope = inheritTestScope(
    {
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
    },
    parentScope,
  );
  registerGetActiveSessionShouldReturnActiveSessionWhenItExists(scope);

  registerGetActiveSessionShouldReturnNullWhenNoActiveSessionExists(scope);

  return scope;
}
