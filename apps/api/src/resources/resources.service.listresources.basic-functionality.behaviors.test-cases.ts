import { createMockResource } from '../test-utils/resource.fixtures';
import { registerListresourcesScopeFixture } from './resources.service.listresources-2c5100.test-fixture';
import { Brackets } from 'typeorm';

export function registerBasicFunctionalityCases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('Basic functionality', () => {
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

      fixture.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 2]);

      const result = await fixture.fixture.service.listResources();

      expect(result.data).toEqual(mockResources);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(fixture.fixture.resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.groups', 'groups');
      expect(fixture.mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.name', 'ASC');
      expect(fixture.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(fixture.mockQueryBuilder.take).toHaveBeenCalledWith(10);
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
      fixture.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

      const result = await fixture.fixture.service.listResources({ page: 2, limit: 5 });

      expect(result.page).toEqual(2);
      expect(result.limit).toEqual(5);
      expect(fixture.mockQueryBuilder.skip).toHaveBeenCalledWith(5); // (page - 1) * limit
      expect(fixture.mockQueryBuilder.take).toHaveBeenCalledWith(5);
    });

    it('should return empty results', async () => {
      fixture.mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await fixture.fixture.service.listResources();

      expect(result.data).toEqual([]);
      expect(result.total).toEqual(0);
    });
  });
}

export function registerEdgeCasesPart7Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('Edge cases', () => {
    it('should handle null/undefined options gracefully', async () => {
      const result = await fixture.fixture.service.listResources(undefined);

      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(fixture.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(fixture.mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should handle empty options object', async () => {
      const result = await fixture.fixture.service.listResources({});

      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
    });

    it('should convert single ID to array for filtering', async () => {
      await fixture.fixture.service.listResources({ ids: 42 });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [42] });
    });

    it('should handle zero and negative page numbers gracefully', async () => {
      await fixture.fixture.service.listResources({ page: 0, limit: 5 });

      // Page 0 should be treated as page 1, so skip should be 0
      expect(fixture.mockQueryBuilder.skip).toHaveBeenCalledWith(-5); // (0-1) * 5
    });

    it('should handle very large limit values', async () => {
      await fixture.fixture.service.listResources({ limit: 1000 });

      expect(fixture.mockQueryBuilder.take).toHaveBeenCalledWith(1000);
    });
  });
}

export function registerGroupFilteringPart2Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('Group filtering', () => {
    it('should filter by specific group ID', async () => {
      await fixture.fixture.service.listResources({ groupId: 5 });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 5 });
    });

    it('should filter resources with no groups when groupId is -1', async () => {
      await fixture.fixture.service.listResources({ groupId: -1 });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
    });

    it('should not add group filter when groupId is undefined', async () => {
      await fixture.fixture.service.listResources();

      expect(fixture.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('groups.id'));
    });
  });
}

export function registerIdsFilteringPart3Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('IDs filtering', () => {
    it('should filter by single resource ID', async () => {
      await fixture.fixture.service.listResources({ ids: 5 });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [5] });
    });

    it('should filter by multiple resource IDs', async () => {
      await fixture.fixture.service.listResources({ ids: [1, 2, 3] });

      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2, 3] });
    });

    it('should not add IDs filter when ids array is empty', async () => {
      await fixture.fixture.service.listResources({ ids: [] });

      expect(fixture.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('resource.id IN'));
    });

    it('should not add IDs filter when ids is undefined', async () => {
      await fixture.fixture.service.listResources();

      expect(fixture.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('resource.id IN'));
    });
  });
}

export function registerInUseFilteringPart4Cases(fixture: ReturnType<typeof registerListresourcesScopeFixture>) {
  describe('In-use filtering', () => {
    it('should filter resources currently in use by specific user', async () => {
      await fixture.fixture.service.listResources({ onlyInUseByUserId: 10 });

      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.endTime IS NULL AND usage.lifecyclePending = FALSE',
      );
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
    });

    it('should not add in-use filter when onlyInUseByUserId is undefined', async () => {
      await fixture.fixture.service.listResources();

      expect(fixture.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.endTime IS NULL AND usage.lifecyclePending = FALSE',
      );
    });

    it('should filter resources currently in use (onlyInUse)', async () => {
      await fixture.fixture.service.listResources({ onlyInUse: true });

      expect(fixture.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.endTime IS NULL AND usage.lifecyclePending = FALSE',
      );
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
    });

    it('should return using user information when returnUsingUser is true', async () => {
      await fixture.fixture.service.listResources({ returnUsingUser: true });

      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.lifecyclePending = FALSE',
      );
      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
    });

    it('should handle combination of onlyInUse and returnUsingUser', async () => {
      await fixture.fixture.service.listResources({ onlyInUse: true, returnUsingUser: true });

      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'resource.usages',
        'usage',
        'usage.lifecyclePending = FALSE',
      );
      expect(fixture.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
      expect(fixture.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
    });
  });
}
