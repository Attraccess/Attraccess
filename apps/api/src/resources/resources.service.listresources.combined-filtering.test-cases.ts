import { createMockResource } from '../test-utils/resource.fixtures';
import { registerListresourcesScopeFixture } from './resources.service.listresources-2c5100.test-fixture';
export function registerCombinedFilteringPart6Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('Combined filtering', () => {
    it('should handle multiple filters simultaneously', async () => {
      const mockResources = [
        createMockResource({
          id: 1,
          name: 'Test Resource',
          description: 'Test Description',
          documentationMarkdown: '# Documentation 1',
        }),
      ];
      fixture.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

      const result = await fixture.fixture.service.listResources({
        page: 2,
        limit: 5,
        search: 'test',
        groupId: 3,
        ids: [1, 2, 3],
        onlyInUseByUserId: 10,
        onlyWithPermissionForUserId: 15,
      });

      // Verify pagination
      expect(fixture.mockQueryBuilder.skip).toHaveBeenCalledWith(5);
      expect(fixture.mockQueryBuilder.take).toHaveBeenCalledWith(5);

      // Verify search filter
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );

      // Verify group filter
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 3 });

      // Verify IDs filter
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2, 3] });

      // Verify all joins for both in-use and permission filtering
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.endTime IS NULL AND usage.lifecyclePending = FALSE',
      );
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');

      // Verify result structure
      expect(result.data).toEqual(mockResources);
      expect(result.total).toEqual(1);
      expect(result.page).toEqual(2);
      expect(result.limit).toEqual(5);
    });

    it('should handle edge case with groupId -1 and other filters', async () => {
      await fixture.fixture.service.listResources({
        groupId: -1,
        search: 'test',
        ids: [1, 2],
      });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2] });
    });

    it('should handle combination of returnUsingUser with other filters', async () => {
      await fixture.fixture.service.listResources({
        returnUsingUser: true,
        onlyWithPermissionForUserId: 15,
        search: 'test',
      });

      // Should use leftJoinAndSelect for usages when returnUsingUser is true
      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.lifecyclePending = FALSE',
      );
      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');

      // Should still add permission filtering joins
      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');

      // Should add search filter
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
        { search: '%test%' },
      );
    });
  });
}
