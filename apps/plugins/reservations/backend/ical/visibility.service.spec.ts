import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { VisibilityService } from './visibility.service';

/**
 * The visibility rules themselves run in the host (`resourceAccess`, `hostData`) and are tested there. This suite
 * proves the plugin asks the right question and keeps the request's token scope.
 */
describe('VisibilityService', () => {
  const resourceAccess = {
    filterVisible: jest.fn(async (_principal: unknown, ids: number[]) => ids),
    canSee: jest.fn(async () => true),
  };
  const resources = {
    filterRequiringSupervision: jest.fn(async (ids: number[]) => ids.filter((id) => id % 2 === 0)),
    listIdsInGroups: jest.fn(async (groupIds: number[]) => groupIds.map((id) => id * 10)),
  };
  const users = { isActive: jest.fn(async (id: number) => id === 1) };
  const context = { resourceAccess, hostData: { resources, users } } as unknown as PluginContext;
  const service = new VisibilityService(context);

  beforeEach(() => jest.clearAllMocks());

  it('asks the host as the request user, so an API token scope applies', async () => {
    const effectivePermissions = new Set(['resources.read']);
    await service.filterVisible({ userId: 4, effectivePermissions }, [1, 2]);
    await service.canSee({ userId: 4, effectivePermissions }, 2);
    expect(resourceAccess.filterVisible).toHaveBeenCalledWith({ id: 4, effectivePermissions }, [1, 2]);
    expect(resourceAccess.canSee).toHaveBeenCalledWith({ id: 4, effectivePermissions }, 2);
  });

  it('asks the host by user id for background work', async () => {
    await service.filterVisible(1, [1, 2]);
    expect(resourceAccess.filterVisible).toHaveBeenCalledWith(1, [1, 2]);
  });

  it('does not ask the host for an empty id list', async () => {
    expect(await service.filterVisible(1, [])).toEqual([]);
    expect(await service.resourceIdsRequiringSupervision([])).toEqual([]);
    expect(await service.resourceIdsOfGroups([])).toEqual([]);
    expect(resourceAccess.filterVisible).not.toHaveBeenCalled();
    expect(resources.filterRequiringSupervision).not.toHaveBeenCalled();
  });

  it('delegates account, supervision and group questions to the host', async () => {
    expect(await service.isActiveAccount(1)).toBe(true);
    expect(await service.isActiveAccount(2)).toBe(false);
    expect(await service.resourceIdsRequiringSupervision([1, 2, 2, 4])).toEqual([2, 4]);
    expect(await service.resourceIdsOfGroups([10, 11])).toEqual([100, 110]);
  });
});
