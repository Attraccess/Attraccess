import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSessionUser } from '@attraccess/application-models';

import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';

import { ResourceSessionStartedEvent } from '../events/resource-usage.events';

import { arrangeIntroducedUser, InMemoryUsageScope } from './fixtures/arrangements.test-fixture';

import { usageInternals } from './fixtures/compose.test-fixture';
import { fakeTransactionScope } from '../../../database/fake-transaction-scope.test-fixture';

describe('ResourceUsageService', () => {
  let scope: InMemoryUsageScope;

  describe('door actions', () => {
    const mockUser: UsageSessionUser = { id: 5 };
    const door = { id: 10, name: 'Front Door', type: ResourceType.Door, separateUnlockAndUnlatch: false };

    beforeEach(async () => {
      ({ scope } = await arrangeIntroducedUser(door, mockUser));
    });

    const startedPayload = () => {
      const [, payload] = scope.events.emitAsync.mock.calls[0];
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      return payload as ResourceSessionStartedEvent;
    };

    it.each([
      ['lock', ResourceUsageAction.DoorLock, 'lockDoor'],
      ['unlock', ResourceUsageAction.DoorUnlock, 'unlockDoor'],
    ] as const)(
      'should %s a door, record it as an already ended usage and emit the event',
      async (_name, action, method) => {
        const result = await scope.service[method](10, mockUser);

        expect(result).toMatchObject({ resourceId: 10, userId: 5, usageAction: action });
        expect(result.endTime).toBeInstanceOf(Date);
        expect(scope.store.sessionById(result.id)).toMatchObject({ usageAction: action, resourceId: 10, userId: 5 });
        expect(scope.events.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));
        expect(startedPayload().usage).toMatchObject({ id: result.id, usageAction: action, resourceId: 10, userId: 5 });
      },
    );

    it('should unlatch a door when supported and emit event', async () => {
      scope.store.addResource({ ...door, separateUnlockAndUnlatch: true });

      const result = await scope.service.unlatchDoor(10, mockUser);

      expect(result).toMatchObject({ resourceId: 10, userId: 5, usageAction: ResourceUsageAction.DoorUnlatch });
      expect(scope.events.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));
      expect(startedPayload().usage).toMatchObject({
        id: result.id,
        usageAction: ResourceUsageAction.DoorUnlatch,
        resourceId: 10,
        userId: 5,
      });
    });

    it('a door action never counts as a running session', async () => {
      await scope.service.unlockDoor(10, mockUser);

      expect(await scope.service.getActiveSession(10)).toBeNull();
    });

    it.each([
      ['door lock', 'lockDoor', false],
      ['door unlock', 'unlockDoor', false],
      ['door unlatch', 'unlatchDoor', true],
    ] as const)('should propagate emitAsync errors from %s', async (_name, method, separateUnlatch) => {
      scope.store.addResource({ ...door, separateUnlockAndUnlatch: separateUnlatch });
      scope.events.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(scope.service[method](10, mockUser)).rejects.toThrow('Flow error');
    });

    it('should throw when operating non-door resource', async () => {
      scope.store.addResource({ ...door, type: ResourceType.Machine });

      await expect(scope.service.lockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
      await expect(scope.service.unlockDoor(10, mockUser)).rejects.toThrow('Resource is not a door');
      expect(scope.store.sessions).toEqual([]);
    });

    it('should throw when unlatching unsupported door', async () => {
      await expect(scope.service.unlatchDoor(10, mockUser)).rejects.toThrow(
        'Door (ID: 10, Name: Front Door) does not support unlatching',
      );
      expect(scope.store.sessions).toEqual([]);
    });
  });

  describe('canControllResource (cache)', () => {
    const mockUser: UsageSessionUser = { id: 1 };
    const resourceId = 42;

    beforeEach(async () => {
      ({ scope } = await arrangeIntroducedUser({ id: resourceId }, mockUser));
    });

    beforeEach(() => {
      scope.introductions.hasValidIntroduction.mockResolvedValue(true);
      scope.introducers.canMaintain.mockResolvedValue(false);
      scope.groupIntroductions.hasValidIntroduction.mockResolvedValue(false);
      scope.groups.getGroupsOfResource.mockResolvedValue([]);
      scope.retraining.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: null,
      });
    });

    it('returns cached result on repeated call without hitting DB again', async () => {
      const first = await scope.service.canControllResource(resourceId, mockUser);
      const second = await scope.service.canControllResource(resourceId, mockUser);

      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('caches the RBAC lookup for users without request-scoped permissions', async () => {
      await scope.service.canControllResource(resourceId, mockUser);
      await scope.service.canControllResource(resourceId, mockUser);

      expect(scope.rbac.getEffectivePermissions).toHaveBeenCalledTimes(1);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('re-queries DB after TTL expires', async () => {
      jest.useFakeTimers();
      try {
        await scope.service.canControllResource(resourceId, mockUser);
        jest.advanceTimersByTime(30_001);
        await scope.service.canControllResource(resourceId, mockUser);

        expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('clears cache on ResourceIntroductionChangedEvent', async () => {
      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);

      scope.service.handleIntroductionChanged();

      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent cache misses', async () => {
      let resolveIntroduction!: (value: boolean) => void;
      scope.introductions.hasValidIntroduction.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
      );

      const first = scope.service.canControllResource(resourceId, mockUser);
      const second = scope.service.canControllResource(resourceId, mockUser);
      await Promise.resolve();
      resolveIntroduction(true);

      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);
      expect(scope.rbac.getEffectivePermissions).toHaveBeenCalledTimes(1);
    });

    it('clears cache on ResourceGroupIntroductionChangedEvent', async () => {
      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);

      scope.service.handleGroupIntroductionChanged();

      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('clears only the specific entry on ResourceIntroducerChangedEvent', async () => {
      const otherUser: UsageSessionUser = {
        id: 2,
        systemPermissions: { canManageResources: false },
      } as UsageSessionUser;
      await scope.service.canControllResource(resourceId, mockUser);
      await scope.service.canControllResource(resourceId, otherUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);

      scope.service.handleIntroducerChanged({
        introducerUserId: mockUser.id,
        resourceId: resourceId,
      } as import('../../introducers/events/resource-introducer-changed.event').ResourceIntroducerChangedEvent);

      await scope.service.canControllResource(resourceId, mockUser);
      // mockUser's entry was cleared; otherUser's entry should still be cached.
      await scope.service.canControllResource(resourceId, otherUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(3);
    });

    it('clears cache on ResourceGroupIntroducerChangedEvent', async () => {
      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);

      scope.service.handleGroupIntroducerChanged();

      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('clears resource entries on ResourceChangedEvent', async () => {
      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);

      scope.service.handleResourceChanged({
        resourceId: resourceId,
      } as import('../../events/resource-changed.event').ResourceChangedEvent);

      expect(
        // @ts-expect-error access private field for testing
        usageInternals(scope.service).access.accessCacheKeysByUser.has(mockUser.id),
      ).toBe(false);

      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('evicts a plain user authorization grant when their RBAC permissions are revoked', async () => {
      scope.introductions.hasValidIntroduction.mockResolvedValue(false);
      scope.rbac.getEffectivePermissions
        .mockResolvedValueOnce(new Set(['resources.update']))
        .mockResolvedValueOnce(new Set<string>());

      await expect(scope.service.canControllResource(resourceId, mockUser)).resolves.toBe(true);

      scope.service.handleUserPermissionsChanged(new UserPermissionsChangedEvent(mockUser.id));

      await expect(scope.service.canControllResource(resourceId, mockUser)).resolves.toBe(false);
      expect(scope.rbac.getEffectivePermissions).toHaveBeenCalledTimes(2);
    });

    it('evicts only the changed user without scanning other authorization entries', async () => {
      const otherUser: UsageSessionUser = {
        id: 2,
        systemPermissions: { canManageResources: false },
      } as UsageSessionUser;
      await scope.service.canControllResource(resourceId, mockUser);
      await scope.service.canControllResource(resourceId, otherUser);

      scope.service.handleUserPermissionsChanged(new UserPermissionsChangedEvent(mockUser.id));

      expect(
        // @ts-expect-error access private field for testing
        usageInternals(scope.service).access.accessCacheKeysByUser.has(mockUser.id),
      ).toBe(false);
      // @ts-expect-error access private field for testing
      expect(usageInternals(scope.service).access.accessCacheKeysByUser.has(otherUser.id)).toBe(true);
    });

    it('does not share privileged results with a restricted principal', async () => {
      const privilegedUser = {
        ...mockUser,
        effectivePermissions: new Set(['resources.update']),
      } as UsageSessionUser;
      const restrictedUser = {
        ...mockUser,
        effectivePermissions: new Set<string>(),
      } as UsageSessionUser;
      scope.introductions.hasValidIntroduction.mockResolvedValue(false);
      scope.introducers.canMaintain.mockResolvedValue(false);

      await expect(scope.service.canControllResource(resourceId, privilegedUser)).resolves.toBe(true);
      await expect(scope.service.canControllResource(resourceId, restrictedUser)).resolves.toBe(false);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('does not cache a grant past a future retraining deadline', async () => {
      jest.useFakeTimers();
      try {
        scope.retraining.getResourceRetrainingStatus.mockResolvedValue({
          blocksAccess: false,
          dueAt: new Date(Date.now() + 1_000),
        });

        await scope.service.canControllResource(resourceId, mockUser);
        jest.advanceTimersByTime(1_001);
        await scope.service.canControllResource(resourceId, mockUser);

        expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('caches a grant with an overdue non-blocking retraining policy', async () => {
      scope.retraining.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: new Date(Date.now() - 1_000),
      });

      await scope.service.canControllResource(resourceId, mockUser);
      await scope.service.canControllResource(resourceId, mockUser);

      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('does not cache a lookup that completed after an invalidation', async () => {
      let resolveIntroduction!: (value: boolean) => void;
      scope.introductions.hasValidIntroduction.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
      );

      const authorization = scope.service.canControllResource(resourceId, {
        ...mockUser,
        effectivePermissions: new Set<string>(),
      } as UsageSessionUser);
      await Promise.resolve();
      scope.service.handleIntroductionChanged();
      resolveIntroduction(true);
      await authorization;

      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('pruneAccessCache evicts expired entries', async () => {
      jest.useFakeTimers();
      try {
        await scope.service.canControllResource(resourceId, mockUser);
        jest.advanceTimersByTime(30_001);
        // @ts-expect-error access private method for testing
        usageInternals(scope.service).access.pruneAccessCache();
        // @ts-expect-error access private field for testing
        expect(usageInternals(scope.service).access.accessCache.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses cache even when a transaction is provided', async () => {
      const transaction = fakeTransactionScope();

      // First call (no transaction) populates the cache.
      await scope.service.canControllResource(resourceId, mockUser);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);

      // Second call WITH a transaction should still hit the cache — no extra DB queries.
      await scope.service.canControllResource(resourceId, mockUser, transaction);
      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('prunes expired entries before adding a new result to a full cache', async () => {
      // @ts-expect-error access private field for testing
      const MAX = usageInternals(scope.service).access.ACCESS_CACHE_MAX_SIZE as number;
      // @ts-expect-error access private field for testing
      const cache = usageInternals(scope.service).access.accessCache as Map<string, unknown>;

      // Fill the cache with expired entries so the next result can claim a slot.
      for (let i = 0; i < MAX; i++) {
        cache.set(`stub:${i}`, { userId: i, resourceId: i, result: true, expiresAt: Date.now() - 1 });
      }

      await scope.service.canControllResource(resourceId, mockUser);

      expect(cache.size).toBe(1);
      expect(cache.has(`${mockUser.id}:${resourceId}:default`)).toBe(true);
    });
  });
});
