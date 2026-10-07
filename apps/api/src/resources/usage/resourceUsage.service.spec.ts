import { defineResourceUsageServiceTests } from './resourceUsage.service.spec.defineResourceUsageServiceTests.test-fixture';
import { defineEndSessionTests } from './resourceUsage.service.spec.defineEndSessionTests.test-fixture';
import { defineStartSessionTests } from './resourceUsage.service.spec.defineStartSessionTests.test-fixture';
import { defineCanControllResourceCacheTests } from './resourceUsage.service.spec.defineCanControllResourceCacheTests.test-fixture';
import { defineSupervisedStartTests } from './resourceUsage.service.spec.defineSupervisedStartTests.test-fixture';
import { defineDoorActionsTests } from './resourceUsage.service.spec.defineDoorActionsTests.test-fixture';
import { defineGetSessionDetailsTests } from './resourceUsage.service.spec.defineGetSessionDetailsTests.test-fixture';
import { defineGetActiveSessionTests } from './resourceUsage.service.spec.defineGetActiveSessionTests.test-fixture';

describe('ResourceUsageService', () => {
  defineResourceUsageServiceTests();
});
export type ResourceUsageServiceTestScope = ReturnType<typeof defineResourceUsageServiceTests>;
export type EndSessionTestScope = ReturnType<typeof defineEndSessionTests>;
export type StartSessionTestScope = ReturnType<typeof defineStartSessionTests>;
export type CanControllResourceCacheTestScope = ReturnType<typeof defineCanControllResourceCacheTests>;
export type SupervisedStartTestScope = ReturnType<typeof defineSupervisedStartTests>;
export type DoorActionsTestScope = ReturnType<typeof defineDoorActionsTests>;
export type GetSessionDetailsTestScope = ReturnType<typeof defineGetSessionDetailsTests>;
export type GetActiveSessionTestScope = ReturnType<typeof defineGetActiveSessionTests>;

export { defineResourceUsageServiceTests } from './resourceUsage.service.spec.defineResourceUsageServiceTests.test-fixture';
export { defineEndSessionTests } from './resourceUsage.service.spec.defineEndSessionTests.test-fixture';
export { defineStartSessionTests } from './resourceUsage.service.spec.defineStartSessionTests.test-fixture';
export { defineCanControllResourceCacheTests } from './resourceUsage.service.spec.defineCanControllResourceCacheTests.test-fixture';
export { defineSupervisedStartTests } from './resourceUsage.service.spec.defineSupervisedStartTests.test-fixture';
export { defineDoorActionsTests } from './resourceUsage.service.spec.defineDoorActionsTests.test-fixture';
export { defineGetSessionDetailsTests } from './resourceUsage.service.spec.defineGetSessionDetailsTests.test-fixture';
export { defineGetActiveSessionTests } from './resourceUsage.service.spec.defineGetActiveSessionTests.test-fixture';
