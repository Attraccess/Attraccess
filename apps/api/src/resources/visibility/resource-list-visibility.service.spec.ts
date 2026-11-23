import { Subject } from 'rxjs';
import type { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ResourceListVisibilityService } from './resource-list-visibility.service';

const userWith = (...permissions: string[]) =>
  ({ id: 7, effectivePermissions: new Set(permissions) }) as unknown as AuthenticatedUser;

describe('ResourceListVisibilityService', () => {
  const setup = (mode: 'authenticated' | 'permitted-only', permittedIds: number[] = []) => {
    const settings = { getResourceListVisibility: jest.fn(async () => mode) };
    const store = {
      permittedIds: jest.fn(async (_user: number, ids: number[]) => ids.filter((id) => permittedIds.includes(id))),
    };
    return { store, settings, service: new ResourceListVisibilityService(settings as never, store as never) };
  };

  it.each(['resources.update', 'resources.access.manage'])(
    'lets the holder of %s see everything in both modes',
    async (key) => {
      for (const mode of ['authenticated', 'permitted-only'] as const) {
        const { service, store } = setup(mode);
        expect(await service.scopeOf(userWith(key))).toBe('all');
        expect(await service.canSee(userWith(key), 5)).toBe(true);
        expect(store.permittedIds).not.toHaveBeenCalled();
      }
    },
  );

  it('lets an account with resources.read see everything in "authenticated" mode', async () => {
    const { service } = setup('authenticated');
    expect(await service.scopeOf(userWith('resources.read'))).toBe('all');
    expect(await service.permittedForUserId(userWith('resources.read'))).toBeUndefined();
  });

  it('narrows an account without resources.read even in "authenticated" mode', async () => {
    const { service } = setup('authenticated', [3]);
    const user = userWith();
    expect(await service.scopeOf(user)).toBe('permitted');
    expect(await service.permittedForUserId(user)).toBe(7);
    expect(await service.filterVisible(user, [3, 4])).toEqual([3]);
  });

  it('narrows everyone but managers in "permitted-only" mode, in the order the ids were given', async () => {
    const { service, store } = setup('permitted-only', [2, 9]);
    const user = userWith('resources.read');
    expect(await service.scopeOf(user)).toBe('permitted');
    expect(await service.filterVisible(user, [9, 1, 2, 9])).toEqual([9, 2]);
    expect(store.permittedIds).toHaveBeenCalledTimes(1);
    expect(await service.canSee(user, 1)).toBe(false);
    expect(await service.canSee(user, 2)).toBe(true);
  });

  it('builds the group context from the narrowing', async () => {
    expect(await setup('permitted-only').service.groupContext(userWith('resources.read'))).toEqual({
      userId: 7,
      canUpdateResources: false,
      permittedOnly: true,
    });
    expect(await setup('permitted-only').service.groupContext(userWith('resources.update'))).toEqual({
      userId: 7,
      canUpdateResources: true,
      permittedOnly: false,
    });
  });

  it('drops live events once the viewer may no longer see the machine, but keeps keepalives', async () => {
    const { service, store } = setup('permitted-only', [3]);
    const source = new Subject<{ data: object }>();
    const seen: object[] = [];
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    service.followVisible(source, userWith('resources.read'), 3).subscribe((event) => seen.push(event.data));
    source.next({ data: { inUse: true } });
    await tick();
    store.permittedIds.mockResolvedValue([]);
    source.next({ data: { inUse: false } });
    source.next({ data: { keepalive: true } });
    // The end of the viewer's own session still arrives although the machine is hidden from them now.
    source.next({ data: { ended: true, ownerUserId: 7 } });
    source.next({ data: { ended: true, ownerUserId: 8 } });
    await tick();
    expect(seen).toEqual([{ inUse: true }, { keepalive: true }, { ended: true, ownerUserId: 7 }]);
  });
});
