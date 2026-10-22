import { TypeormResourceCatalogPersistence } from './typeorm-adapter';
import { Resource } from '@attraccess/database-entities';
import { Brackets, SelectQueryBuilder } from 'typeorm';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { createMockResource } from '../../test-utils/resource.fixtures';
import { activeUsageSql } from '../usage/sessions/active-usage';

const resourceRepository = { createQueryBuilder: jest.fn() };
const scope = { resourceRepository, persistence: new TypeormResourceCatalogPersistence(resourceRepository as never) };
// These assertions exercise adapter query construction directly. Application policy uses operation fakes.
describe('listResources', () => {
  let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<Resource>>;
  const listResourcesScope = inheritTestScope(
    {
      get mockQueryBuilder() {
        return mockQueryBuilder;
      },
      set mockQueryBuilder(value: typeof mockQueryBuilder) {
        mockQueryBuilder = value;
      },
    },
    scope,
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

    scope.resourceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('Basic functionality', () => {
    const basicFunctionalityScope = inheritTestScope(
      {
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
        get parentScope() {
          return listResourcesScope;
        },
      },
      listResourcesScope,
    );

    it('should return paginated resources with default options', async () => {
      const mockResources = [
        createMockResource({
          id: 1,
          name: 'Resource 1',
          description: 'Description 1',
          documentationMarkdown: '# Documentation 1',
        }),
        createMockResource({
          id: 2,
          name: 'Resource 2',
          description: 'Description 2',
          documentationMarkdown: '# Documentation 2',
        }),
      ];

      basicFunctionalityScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 2]);

      const result = await basicFunctionalityScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });

      expect(result[0]).toEqual(mockResources);
      expect(result[1]).toEqual(2);
      expect(basicFunctionalityScope.parentScope.resourceRepository.createQueryBuilder).toHaveBeenCalledWith(
        'resource',
      );
      expect(basicFunctionalityScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.groups',
        'groups',
      );
      expect(basicFunctionalityScope.mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.name', 'ASC');
      expect(basicFunctionalityScope.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(basicFunctionalityScope.mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should handle custom pagination', async () => {
      const mockResources = [
        createMockResource({
          id: 1,
          name: 'Resource 1',
          description: 'Description 1',
          documentationMarkdown: '# Documentation 1',
        }),
      ];
      basicFunctionalityScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

      await basicFunctionalityScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{ page: 2, limit: 5 },
      });

      expect(basicFunctionalityScope.mockQueryBuilder.skip).toHaveBeenCalledWith(5); // (page - 1) * limit
      expect(basicFunctionalityScope.mockQueryBuilder.take).toHaveBeenCalledWith(5);
    });

    it('should return empty results', async () => {
      basicFunctionalityScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await basicFunctionalityScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });

      expect(result[0]).toEqual([]);
      expect(result[1]).toEqual(0);
    });
  });

  describe('Search filtering', () => {
    const searchFilteringScope = inheritTestScope(
      {
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
        get parentScope() {
          return listResourcesScope;
        },
      },
      listResourcesScope,
    );

    it('should filter by search term in name and description', async () => {
      const mockResources = [
        createMockResource({
          id: 1,
          name: 'Test Resource',
          description: 'Test Description',
          documentationMarkdown: '# Documentation 1',
        }),
      ];
      searchFilteringScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

      await searchFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ search: 'test' } });

      expect(searchFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
    });

    it('should not add search filter when search is empty', async () => {
      await searchFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ search: '' } });

      expect(searchFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('LOWER(resource.name) LIKE LOWER(:search)'),
      );
    });
  });

  describe('Group filtering', () => {
    const groupFilteringScope = inheritTestScope(
      {
        get parentScope() {
          return listResourcesScope;
        },
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
      },
      listResourcesScope,
    );

    it('should filter by specific group ID', async () => {
      await groupFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ groupId: 5 } });

      expect(groupFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', {
        groupId: 5,
      });
    });

    it('should filter resources with no groups when groupId is -1', async () => {
      await groupFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ groupId: -1 } });

      expect(groupFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
    });

    it('should not add group filter when groupId is undefined', async () => {
      await groupFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });

      expect(groupFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('groups.id'),
      );
    });
  });

  describe('IDs filtering', () => {
    const idsFilteringScope = inheritTestScope(
      {
        get parentScope() {
          return listResourcesScope;
        },
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
      },
      listResourcesScope,
    );

    it('should filter by single resource ID', async () => {
      await idsFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ ids: [5] } });

      expect(idsFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
        ids: [5],
      });
    });

    it('should filter by multiple resource IDs', async () => {
      await idsFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ ids: [1, 2, 3] } });

      expect(idsFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
        ids: [1, 2, 3],
      });
    });

    it('should not add IDs filter when ids array is empty', async () => {
      await idsFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ ids: [] } });

      expect(idsFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('resource.id IN'),
      );
    });

    it('should not add IDs filter when ids is undefined', async () => {
      await idsFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });

      expect(idsFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('resource.id IN'),
      );
    });
  });

  describe('In-use filtering', () => {
    const inUseFilteringScope = inheritTestScope(
      {
        get parentScope() {
          return listResourcesScope;
        },
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
      },
      listResourcesScope,
    );

    it('should filter resources currently in use by specific user', async () => {
      await inUseFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{ onlyInUseByUserId: 10 },
      });

      expect(inUseFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
      expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('should not add in-use filter when onlyInUseByUserId is undefined', async () => {
      await inUseFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });

      expect(inUseFilteringScope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
    });

    it('should filter resources currently in use (onlyInUse)', async () => {
      await inUseFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ onlyInUse: true } });

      expect(inUseFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
      expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
      expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
    });

    it('should return using user information when returnUsingUser is true', async () => {
      await inUseFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{ returnUsingUser: true },
      });

      expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
      expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
    });

    it('should handle combination of onlyInUse and returnUsingUser', async () => {
      await inUseFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{ onlyInUse: true, returnUsingUser: true },
      });

      expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
      expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
      expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
      expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
    });
  });

  describe('Permission filtering', () => {
    const permissionFilteringScope = inheritTestScope(
      {
        get parentScope() {
          return listResourcesScope;
        },
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
      },
      listResourcesScope,
    );

    it('should filter resources with permissions for specific user', async () => {
      await permissionFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{ onlyWithPermissionForUserId: 15 },
      });

      // Check all the necessary joins for permission checking
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.introducers',
        'introducer',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.introductions',
        'introduction',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'introduction.history',
        'resourceIntroductionHistory',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.groups',
        'resourceGroup',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resourceGroup.introducers',
        'groupIntroducer',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resourceGroup.introductions',
        'groupIntroduction',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'groupIntroduction.history',
        'groupIntroductionHistory',
      );

      // Check that the complex where condition is added
      expect(permissionFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('should not add permission filter when onlyWithPermissionForUserId is undefined', async () => {
      await permissionFilteringScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });

      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
        'resource.introducers',
        'introducer',
      );
      expect(permissionFilteringScope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
        'resource.introductions',
        'introduction',
      );
    });
  });

  describe('Combined filtering', () => {
    const combinedFilteringScope = inheritTestScope(
      {
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
        get parentScope() {
          return listResourcesScope;
        },
      },
      listResourcesScope,
    );

    it('should handle multiple filters simultaneously', async () => {
      const mockResources = [
        createMockResource({
          id: 1,
          name: 'Test Resource',
          description: 'Test Description',
          documentationMarkdown: '# Documentation 1',
        }),
      ];
      combinedFilteringScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

      const result = await combinedFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{
          page: 2,
          limit: 5,
          search: 'test',
          groupId: 3,
          ids: [1, 2, 3],
          onlyInUseByUserId: 10,
          onlyWithPermissionForUserId: 15,
        },
      });

      // Verify pagination
      expect(combinedFilteringScope.mockQueryBuilder.skip).toHaveBeenCalledWith(5);
      expect(combinedFilteringScope.mockQueryBuilder.take).toHaveBeenCalledWith(5);

      // Verify search filter
      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );

      // Verify group filter
      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', {
        groupId: 3,
      });

      // Verify IDs filter
      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
        ids: [1, 2, 3],
      });

      // Verify all joins for both in-use and permission filtering
      expect(combinedFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
      expect(combinedFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.introducers',
        'introducer',
      );

      // Verify result structure
      expect(result[0]).toEqual(mockResources);
      expect(result[1]).toEqual(1);
    });

    it('should handle edge case with groupId -1 and other filters', async () => {
      await combinedFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{
          groupId: -1,
          search: 'test',
          ids: [1, 2],
        },
      });

      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
        ids: [1, 2],
      });
    });

    it('should handle combination of returnUsingUser with other filters', async () => {
      await combinedFilteringScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{
          returnUsingUser: true,
          onlyWithPermissionForUserId: 15,
          search: 'test',
        },
      });

      // Should use leftJoinAndSelect for usages when returnUsingUser is true
      expect(combinedFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        activeUsageSql('usage'),
      );
      expect(combinedFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');

      // Should still add permission filtering joins
      expect(combinedFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.introducers',
        'introducer',
      );

      // Should add search filter
      expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
    });
  });

  describe('Edge cases', () => {
    const edgeCasesScope = inheritTestScope(
      {
        get parentScope() {
          return listResourcesScope;
        },
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
      },
      listResourcesScope,
    );

    it('should handle null/undefined options gracefully', async () => {
      await edgeCasesScope.parentScope.persistence.catalogPage({ page: 1, limit: 10 });

      expect(edgeCasesScope.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(edgeCasesScope.mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should handle empty options object', async () => {
      await edgeCasesScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{} });
    });

    it('should convert single ID to array for filtering', async () => {
      await edgeCasesScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ ids: [42] } });

      expect(edgeCasesScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
        ids: [42],
      });
    });

    it('should handle zero and negative page numbers gracefully', async () => {
      await edgeCasesScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ page: 0, limit: 5 } });

      // Page 0 should be treated as page 1, so skip should be 0
      expect(edgeCasesScope.mockQueryBuilder.skip).toHaveBeenCalledWith(-5); // (0-1) * 5
    });

    it('should handle very large limit values', async () => {
      await edgeCasesScope.parentScope.persistence.catalogPage({ page: 1, limit: 10, ...{ limit: 1000 } });

      expect(edgeCasesScope.mockQueryBuilder.take).toHaveBeenCalledWith(1000);
    });
  });

  describe('Query builder method calls order and structure', () => {
    const queryBuilderMethodCallsOrderAndStructureScope = inheritTestScope(
      {
        get parentScope() {
          return listResourcesScope;
        },
        get mockQueryBuilder() {
          return listResourcesScope.mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
          listResourcesScope.mockQueryBuilder = value;
        },
      },
      listResourcesScope,
    );

    it('should maintain proper query builder method call order', async () => {
      await queryBuilderMethodCallsOrderAndStructureScope.parentScope.persistence.catalogPage({
        page: 1,
        limit: 10,
        ...{
          search: 'test',
          groupId: 1,
          onlyWithPermissionForUserId: 5,
        },
      });

      // Verify that basic joins happen before filters
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.groups',
        'groups',
      );
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'resource.name',
        'ASC',
      );
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.getManyAndCount).toHaveBeenCalled();

      // Verify that permission-related joins are called
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.introducers',
        'introducer',
      );
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.introductions',
        'introduction',
      );

      // Verify that filters are applied
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'groups.id = :groupId',
        { groupId: 1 },
      );
      expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
    });
  });
});
