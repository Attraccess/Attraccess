import { Resource } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { ResourcesServiceTestScope } from './resources.service.spec';
import { defineCombinedFilteringTests } from './resources.service.spec.defineCombinedFilteringTests.test-fixture';
import { defineBasicFunctionalityTests } from './resources.service.spec.defineBasicFunctionalityTests.test-fixture';
import { defineInUseFilteringTests } from './resources.service.spec.defineInUseFilteringTests.test-fixture';
import { definePermissionFilteringTests } from './resources.service.spec.definePermissionFilteringTests.test-fixture';
import { defineEdgeCasesTests } from './resources.service.spec.defineEdgeCasesTests.test-fixture';
import { defineQueryBuilderMethodCallsOrderAndStructureTests } from './resources.service.spec.defineQueryBuilderMethodCallsOrderAndStructureTests.test-fixture';
import { defineSearchFilteringTests } from './resources.service.spec.defineSearchFilteringTests.test-fixture';
import { defineIdsFilteringTests } from './resources.service.spec.defineIdsFilteringTests.test-fixture';
import { defineGroupFilteringTests } from './resources.service.spec.defineGroupFilteringTests.test-fixture';

export function defineListResourcesTests(parentScope: ResourcesServiceTestScope) {
  let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<Resource>>;
  const scope = inheritTestScope(
    {
      get mockQueryBuilder() {
        return mockQueryBuilder;
      },
      set mockQueryBuilder(value: typeof mockQueryBuilder) {
        mockQueryBuilder = value;
      },
    },
    parentScope,
  );

  beforeEach(() => {
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getSql: jest.fn().mockReturnValue('SELECT * FROM resource'),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Resource>>;

    parentScope.resourceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('Basic functionality', () => {
    defineBasicFunctionalityTests(scope);
  });

  describe('Search filtering', () => {
    defineSearchFilteringTests(scope);
  });

  describe('Group filtering', () => {
    defineGroupFilteringTests(scope);
  });

  describe('IDs filtering', () => {
    defineIdsFilteringTests(scope);
  });

  describe('In-use filtering', () => {
    defineInUseFilteringTests(scope);
  });

  describe('Permission filtering', () => {
    definePermissionFilteringTests(scope);
  });

  describe('Combined filtering', () => {
    defineCombinedFilteringTests(scope);
  });

  describe('Edge cases', () => {
    defineEdgeCasesTests(scope);
  });

  describe('Query builder method calls order and structure', () => {
    defineQueryBuilderMethodCallsOrderAndStructureTests(scope);
  });

  return scope;
}
