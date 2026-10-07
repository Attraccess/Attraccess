import { User } from '@attraccess/database-entities';
import { UserPermissionsChangedEvent } from '../../users-and-auth/rbac/events/user-permissions-changed.event';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';
export function registerCanControllResourceCacheCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('canControllResource (cache)', () => {
    const mockUser: User = { id: 1, systemPermissions: { canManageResources: false } } as User;
    const resourceId = 42;

    beforeEach(() => {
      fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      fixture.resourceIntroducersService.canMaintain.mockResolvedValue(false);
      fixture.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      fixture.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
      fixture.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: null,
      });
    });

    it('returns cached result on repeated call without hitting DB again', async () => {
      const first = await fixture.service.canControllResource(resourceId, mockUser);
      const second = await fixture.service.canControllResource(resourceId, mockUser);

      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('caches the RBAC lookup for users without request-scoped permissions', async () => {
      await fixture.service.canControllResource(resourceId, mockUser);
      await fixture.service.canControllResource(resourceId, mockUser);

      expect(fixture.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(1);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('re-queries DB after TTL expires', async () => {
      jest.useFakeTimers();
      try {
        await fixture.service.canControllResource(resourceId, mockUser);
        jest.advanceTimersByTime(30_001);
        await fixture.service.canControllResource(resourceId, mockUser);

        expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('clears cache on ResourceIntroductionChangedEvent', async () => {
      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      fixture.service.handleIntroductionChanged();

      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent cache misses', async () => {
      let resolveIntroduction!: (value: boolean) => void;
      fixture.resourceIntroductionService.hasValidIntroduction.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
      );

      const first = fixture.service.canControllResource(resourceId, mockUser);
      const second = fixture.service.canControllResource(resourceId, mockUser);
      await Promise.resolve();
      resolveIntroduction(true);

      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
      expect(fixture.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(1);
    });

    it('clears cache on ResourceGroupIntroductionChangedEvent', async () => {
      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      fixture.service.handleGroupIntroductionChanged();

      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('clears only the specific entry on ResourceIntroducerChangedEvent', async () => {
      const otherUser: User = { id: 2, systemPermissions: { canManageResources: false } } as User;
      await fixture.service.canControllResource(resourceId, mockUser);
      await fixture.service.canControllResource(resourceId, otherUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);

      fixture.service.handleIntroducerChanged({
        introducerUserId: mockUser.id,
        resourceId,
      } as import('../introducers/events/resource-introducer-changed.event').ResourceIntroducerChangedEvent);

      await fixture.service.canControllResource(resourceId, mockUser);
      // mockUser's entry was cleared; otherUser's entry should still be cached.
      await fixture.service.canControllResource(resourceId, otherUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(3);
    });

    it('clears cache on ResourceGroupIntroducerChangedEvent', async () => {
      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      fixture.service.handleGroupIntroducerChanged();

      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('clears resource entries on ResourceChangedEvent', async () => {
      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      fixture.service.handleResourceChanged({
        resourceId,
      } as import('../events/resource-changed.event').ResourceChangedEvent);

      // @ts-expect-error access private field for testing
      expect(fixture.service.accessCacheKeysByUser.has(mockUser.id)).toBe(false);

      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('evicts a plain user authorization grant when their RBAC permissions are revoked', async () => {
      fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
      fixture.mockRbacService.getEffectivePermissions
        .mockResolvedValueOnce(new Set(['resources.update']))
        .mockResolvedValueOnce(new Set<string>());

      await expect(fixture.service.canControllResource(resourceId, mockUser)).resolves.toBe(true);

      fixture.service.handleUserPermissionsChanged(new UserPermissionsChangedEvent(mockUser.id));

      await expect(fixture.service.canControllResource(resourceId, mockUser)).resolves.toBe(false);
      expect(fixture.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(2);
    });

    it('evicts only the changed user without scanning other authorization entries', async () => {
      const otherUser: User = { id: 2, systemPermissions: { canManageResources: false } } as User;
      await fixture.service.canControllResource(resourceId, mockUser);
      await fixture.service.canControllResource(resourceId, otherUser);

      fixture.service.handleUserPermissionsChanged(new UserPermissionsChangedEvent(mockUser.id));

      // @ts-expect-error access private field for testing
      expect(fixture.service.accessCacheKeysByUser.has(mockUser.id)).toBe(false);
      // @ts-expect-error access private field for testing
      expect(fixture.service.accessCacheKeysByUser.has(otherUser.id)).toBe(true);
    });

    it('does not share privileged results with a restricted principal', async () => {
      const privilegedUser = {
        ...mockUser,
        effectivePermissions: new Set(['resources.update']),
      } as User;
      const restrictedUser = {
        ...mockUser,
        effectivePermissions: new Set<string>(),
      } as User;
      fixture.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
      fixture.resourceIntroducersService.canMaintain.mockResolvedValue(false);

      await expect(fixture.service.canControllResource(resourceId, privilegedUser)).resolves.toBe(true);
      await expect(fixture.service.canControllResource(resourceId, restrictedUser)).resolves.toBe(false);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('does not cache a grant past a future retraining deadline', async () => {
      jest.useFakeTimers();
      try {
        fixture.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
          blocksAccess: false,
          dueAt: new Date(Date.now() + 1_000),
        });

        await fixture.service.canControllResource(resourceId, mockUser);
        jest.advanceTimersByTime(1_001);
        await fixture.service.canControllResource(resourceId, mockUser);

        expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('caches a grant with an overdue non-blocking retraining policy', async () => {
      fixture.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: new Date(Date.now() - 1_000),
      });

      await fixture.service.canControllResource(resourceId, mockUser);
      await fixture.service.canControllResource(resourceId, mockUser);

      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('does not cache a lookup that completed after an invalidation', async () => {
      let resolveIntroduction!: (value: boolean) => void;
      fixture.resourceIntroductionService.hasValidIntroduction.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
      );

      const authorization = fixture.service.canControllResource(resourceId, {
        ...mockUser,
        effectivePermissions: new Set<string>(),
      } as User);
      await Promise.resolve();
      fixture.service.handleIntroductionChanged();
      resolveIntroduction(true);
      await authorization;

      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('pruneAccessCache evicts expired entries', async () => {
      jest.useFakeTimers();
      try {
        await fixture.service.canControllResource(resourceId, mockUser);
        jest.advanceTimersByTime(30_001);
        // @ts-expect-error access private method for testing
        fixture.service.pruneAccessCache();
        // @ts-expect-error access private field for testing
        expect(fixture.service.accessCache.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses cache even when transactionalEntityManager is provided', async () => {
      const fakeTem = {} as import('typeorm').EntityManager;

      // First call (no TEM) populates the cache.
      await fixture.service.canControllResource(resourceId, mockUser);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      // Second call WITH a TEM should still hit the cache — no extra DB queries.
      await fixture.service.canControllResource(resourceId, mockUser, fakeTem);
      expect(fixture.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('prunes expired entries before adding a new result to a full cache', async () => {
      // @ts-expect-error access private field for testing
      const MAX = fixture.service.ACCESS_CACHE_MAX_SIZE as number;
      // @ts-expect-error access private field for testing
      const cache = fixture.service.accessCache as Map<string, unknown>;

      // Fill the cache with expired entries so the next result can claim a slot.
      for (let i = 0; i < MAX; i++) {
        cache.set(`stub:${i}`, { userId: i, resourceId: i, result: true, expiresAt: Date.now() - 1 });
      }

      await fixture.service.canControllResource(resourceId, mockUser);

      expect(cache.size).toBe(1);
      expect(cache.has(`${mockUser.id}:${resourceId}:default`)).toBe(true);
    });
  });
}
