import { defineResourcesServiceTests } from './resources.service.spec.defineResourcesServiceTests.test-fixture';
import { defineListResourcesTests } from './resources.service.spec.defineListResourcesTests.test-fixture';
import { defineUpdateResourceTests } from './resources.service.spec.defineUpdateResourceTests.test-fixture';
import { defineCombinedFilteringTests } from './resources.service.spec.defineCombinedFilteringTests.test-fixture';
import { defineCreateResourceTests } from './resources.service.spec.defineCreateResourceTests.test-fixture';
import { defineBasicFunctionalityTests } from './resources.service.spec.defineBasicFunctionalityTests.test-fixture';
import { defineInUseFilteringTests } from './resources.service.spec.defineInUseFilteringTests.test-fixture';
import { defineDeleteResourceTests } from './resources.service.spec.defineDeleteResourceTests.test-fixture';
import { definePermissionFilteringTests } from './resources.service.spec.definePermissionFilteringTests.test-fixture';
import { defineEdgeCasesTests } from './resources.service.spec.defineEdgeCasesTests.test-fixture';
import { defineQueryBuilderMethodCallsOrderAndStructureTests } from './resources.service.spec.defineQueryBuilderMethodCallsOrderAndStructureTests.test-fixture';
import { defineSearchFilteringTests } from './resources.service.spec.defineSearchFilteringTests.test-fixture';
import { defineIdsFilteringTests } from './resources.service.spec.defineIdsFilteringTests.test-fixture';
import { defineGetResourceByIdTests } from './resources.service.spec.defineGetResourceByIdTests.test-fixture';
import { defineGroupFilteringTests } from './resources.service.spec.defineGroupFilteringTests.test-fixture';

describe('ResourcesService', () => {
  defineResourcesServiceTests();
});
export type ResourcesServiceTestScope = ReturnType<typeof defineResourcesServiceTests>;
export type ListResourcesTestScope = ReturnType<typeof defineListResourcesTests>;
export type UpdateResourceTestScope = ReturnType<typeof defineUpdateResourceTests>;
export type CombinedFilteringTestScope = ReturnType<typeof defineCombinedFilteringTests>;
export type CreateResourceTestScope = ReturnType<typeof defineCreateResourceTests>;
export type BasicFunctionalityTestScope = ReturnType<typeof defineBasicFunctionalityTests>;
export type InUseFilteringTestScope = ReturnType<typeof defineInUseFilteringTests>;
export type DeleteResourceTestScope = ReturnType<typeof defineDeleteResourceTests>;
export type PermissionFilteringTestScope = ReturnType<typeof definePermissionFilteringTests>;
export type EdgeCasesTestScope = ReturnType<typeof defineEdgeCasesTests>;
export type QueryBuilderMethodCallsOrderAndStructureTestScope = ReturnType<
  typeof defineQueryBuilderMethodCallsOrderAndStructureTests
>;
export type SearchFilteringTestScope = ReturnType<typeof defineSearchFilteringTests>;
export type IdsFilteringTestScope = ReturnType<typeof defineIdsFilteringTests>;
export type GetResourceByIdTestScope = ReturnType<typeof defineGetResourceByIdTests>;
export type GroupFilteringTestScope = ReturnType<typeof defineGroupFilteringTests>;

export { defineResourcesServiceTests } from './resources.service.spec.defineResourcesServiceTests.test-fixture';
export { defineListResourcesTests } from './resources.service.spec.defineListResourcesTests.test-fixture';
export { defineUpdateResourceTests } from './resources.service.spec.defineUpdateResourceTests.test-fixture';
export { defineCombinedFilteringTests } from './resources.service.spec.defineCombinedFilteringTests.test-fixture';
export { defineCreateResourceTests } from './resources.service.spec.defineCreateResourceTests.test-fixture';
export { defineBasicFunctionalityTests } from './resources.service.spec.defineBasicFunctionalityTests.test-fixture';
export { defineInUseFilteringTests } from './resources.service.spec.defineInUseFilteringTests.test-fixture';
export { defineDeleteResourceTests } from './resources.service.spec.defineDeleteResourceTests.test-fixture';
export { definePermissionFilteringTests } from './resources.service.spec.definePermissionFilteringTests.test-fixture';
export { defineEdgeCasesTests } from './resources.service.spec.defineEdgeCasesTests.test-fixture';
export { defineQueryBuilderMethodCallsOrderAndStructureTests } from './resources.service.spec.defineQueryBuilderMethodCallsOrderAndStructureTests.test-fixture';
export { defineSearchFilteringTests } from './resources.service.spec.defineSearchFilteringTests.test-fixture';
export { defineIdsFilteringTests } from './resources.service.spec.defineIdsFilteringTests.test-fixture';
export { defineGetResourceByIdTests } from './resources.service.spec.defineGetResourceByIdTests.test-fixture';
export { defineGroupFilteringTests } from './resources.service.spec.defineGroupFilteringTests.test-fixture';
