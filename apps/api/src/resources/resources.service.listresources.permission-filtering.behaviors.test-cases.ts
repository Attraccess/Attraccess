import { Brackets } from 'typeorm';
import { registerListresourcesScopeFixture } from './resources.service.listresources-2c5100.test-fixture';
import { createMockResource } from '../test-utils/resource.fixtures';
import { registerBasicFunctionalityCases } from './resources.service.listresources.basic-functionality.behaviors.test-cases';
import { registerCombinedFilteringPart6Cases } from './resources.service.listresources.combined-filtering.test-cases';
import { registerEdgeCasesPart7Cases } from './resources.service.listresources.basic-functionality.behaviors.test-cases';
import { registerGroupFilteringPart2Cases } from './resources.service.listresources.basic-functionality.behaviors.test-cases';
import { registerIdsFilteringPart3Cases } from './resources.service.listresources.basic-functionality.behaviors.test-cases';
import { registerInUseFilteringPart4Cases } from './resources.service.listresources.basic-functionality.behaviors.test-cases';
import { registerPermissionFilteringPart5Cases } from './resources.service.listresources.permission-filtering.behaviors.test-cases';
import { registerQueryBuilderMethodCallsOrderAndStructurePart8Cases } from './resources.service.listresources.permission-filtering.behaviors.test-cases';
import { registerSearchFilteringPart1Cases } from './resources.service.listresources.permission-filtering.behaviors.test-cases';
import { registerResourcesServiceFixture } from './resources.service.resources-service.test-fixture';

export function registerPermissionFilteringPart5Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('Permission filtering', () => {
    it('should filter resources with permissions for specific user', async () => {
      await fixture.fixture.service.listResources({ onlyWithPermissionForUserId: 15 });

      // Check all the necessary joins for permission checking
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introductions', 'introduction');
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'introduction.history',
        'resourceIntroductionHistory',
      );
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.groups', 'resourceGroup');
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resourceGroup.introducers', 'groupIntroducer');
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resourceGroup.introductions',
        'groupIntroduction',
      );
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'groupIntroduction.history',
        'groupIntroductionHistory',
      );

      // Check that the complex where condition is added
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('should not add permission filter when onlyWithPermissionForUserId is undefined', async () => {
      await fixture.fixture.service.listResources();

      expect(fixture.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.introducers', 'introducer');
      expect(fixture.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.introductions', 'introduction');
    });
  });
}

export function registerQueryBuilderMethodCallsOrderAndStructurePart8Cases(
  fixture: ReturnType<typeof registerListresourcesScopeFixture>,
) {
  describe('Query builder method calls order and structure', () => {
    it('should maintain proper query builder method call order', async () => {
      await fixture.fixture.service.listResources({
        search: 'test',
        groupId: 1,
        onlyWithPermissionForUserId: 5,
      });

      // Verify that basic joins happen before filters
      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.groups', 'groups');
      expect(fixture.mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.name', 'ASC');
      expect(fixture.mockQueryBuilder.getManyAndCount).toHaveBeenCalled();

      // Verify that permission-related joins are called
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introductions', 'introduction');

      // Verify that filters are applied
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 1 });
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
    });
  });
}

export function registerSearchFilteringPart1Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('Search filtering', () => {
    it('should filter by search term in name and description', async () => {
      const mockResources = [
        createMockResource({
          id: 1,
          name: 'Test Resource',
          description: 'Test Description',
          documentationMarkdown: '# Documentation 1',
        }),
      ];
      fixture.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

      await fixture.fixture.service.listResources({ search: 'test' });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
    });

    it('should not add search filter when search is empty', async () => {
      await fixture.fixture.service.listResources({ search: '' });

      expect(fixture.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('LOWER(resource.name) LIKE LOWER(:search)'),
      );
    });
  });
}

export function registerListResourcesCases(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  describe('listResources', () => {
    const scope = registerListresourcesScopeFixture(fixture);
    registerBasicFunctionalityCases(scope);
    registerSearchFilteringPart1Cases(scope);
    registerGroupFilteringPart2Cases(scope);
    registerIdsFilteringPart3Cases(scope);
    registerInUseFilteringPart4Cases(scope);
    registerPermissionFilteringPart5Cases(scope);
    registerCombinedFilteringPart6Cases(scope);
    registerEdgeCasesPart7Cases(scope);
    registerQueryBuilderMethodCallsOrderAndStructurePart8Cases(scope);
  });
}
