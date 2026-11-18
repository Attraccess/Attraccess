import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { AccessService } from '../reservations/access.service';
import { VisibilityService } from './visibility.service';

/**
 * The visibility rules themselves (hidden groups, introducers, granted introductions, supervision, soft deletes) run
 * in the host's `hostData` adapter and are tested there against real host tables. This suite proves the plugin asks
 * the right question and applies the `resources.update` shortcut.
 */
describe('VisibilityService', () => {
  const updaters = new Set<number>();
  const resources = {
    filterVisible: jest.fn(async (_userId: number, ids: number[], _options?: { seeAll?: boolean }) => ids),
    filterRequiringSupervision: jest.fn(async (ids: number[]) => ids.filter((id) => id % 2 === 0)),
    listIdsInGroups: jest.fn(async (groupIds: number[]) => groupIds.map((id) => id * 10)),
  };
  const users = { isActive: jest.fn(async (id: number) => id === 1) };
  const context = { hostData: { resources, users } } as unknown as PluginContext;
  const service = new VisibilityService(context, {
    hasUpdatePermission: async (userId: number) => updaters.has(userId),
  } as unknown as AccessService);

  beforeEach(() => {
    updaters.clear();
    jest.clearAllMocks();
  });

  it('asks the host which of the distinct resources the user may see', async () => {
    expect(await service.filterVisible(1, [1, 2, 2, 3])).toEqual([1, 2, 3]);
    expect(resources.filterVisible).toHaveBeenCalledWith(1, [1, 2, 3], { seeAll: false });
  });

  it('lets resources.update holders see everything that exists', async () => {
    updaters.add(4);
    await service.filterVisible(4, [1, 2]);
    expect(resources.filterVisible).toHaveBeenCalledWith(4, [1, 2], { seeAll: true });
  });

  it('does not ask the host for an empty id list', async () => {
    expect(await service.filterVisible(1, [])).toEqual([]);
    expect(await service.resourceIdsRequiringSupervision([])).toEqual([]);
    expect(await service.resourceIdsOfGroups([])).toEqual([]);
    expect(resources.filterVisible).not.toHaveBeenCalled();
    expect(resources.filterRequiringSupervision).not.toHaveBeenCalled();
  });

  it('delegates account, supervision and group questions to the host', async () => {
    expect(await service.isActiveAccount(1)).toBe(true);
    expect(await service.isActiveAccount(2)).toBe(false);
    expect(await service.resourceIdsRequiringSupervision([1, 2, 2, 4])).toEqual([2, 4]);
    expect(await service.resourceIdsOfGroups([10, 11])).toEqual([100, 110]);
  });
});
