import { Resource, ResourceType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';

import { inheritTestScope } from '../../../test-utils/inherit-test-scope';

import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';

import { ResourceSessionStartedEvent } from '../events/resource-usage.events';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createEndSessionFixture } from './fixtures/end-session.test-fixture';

import { createResourceUsageServiceFixture } from './fixtures/service.test-fixture';

import { createStartSessionFixture } from './fixtures/start-session.test-fixture';

import { createSupervisedStartFixture } from './fixtures/supervised-start.test-fixture';

import { mockRbacService } from './fixtures/rbac.test-fixture';

export type ResourceUsageServiceTestScope = ReturnType<typeof createResourceUsageServiceFixture>;

export type EndSessionTestScope = ReturnType<typeof createEndSessionFixture>;

export type StartSessionTestScope = ReturnType<typeof createStartSessionFixture>;

export type SupervisedStartTestScope = ReturnType<typeof createSupervisedStartFixture>;

describe('ResourceUsageService', () => {
  // Expose transactional entity manager for assertions
  const scope = createResourceUsageServiceFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRbacService.getEffectivePermissions.mockResolvedValue(new Set<string>());
  });

  describe('door actions', () => {
    const mockUser: User = { id: 5 } as User;
    const doorResource: Resource = {
      id: 10,
      name: 'Front Door',
      type: ResourceType.Door,
      allowTakeOver: false,
      separateUnlockAndUnlatch: false,
    } as Resource;
    const doorActionsScope = inheritTestScope(
      {
        get resourceRepository() {
          return scope.resourceRepository;
        },
        set resourceRepository(value: typeof scope.resourceRepository) {
          scope.resourceRepository = value;
        },
        get doorResource() {
          return doorResource;
        },
        get resourceUsageRepository() {
          return scope.resourceUsageRepository;
        },
        set resourceUsageRepository(value: typeof scope.resourceUsageRepository) {
          scope.resourceUsageRepository = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get mockUser() {
          return mockUser;
        },
        get eventEmitter() {
          return scope.eventEmitter;
        },
        set eventEmitter(value: typeof scope.eventEmitter) {
          scope.eventEmitter = value;
        },
      },
      scope,
    );

    beforeEach(() => {
      // Common permission/maintenance happy-path mocks
      scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
      scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
      scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
    });

    it('should lock a door and emit event', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue(doorActionsScope.doorResource);
      const saved = {
        id: 100,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      doorActionsScope.resourceUsageRepository.save.mockResolvedValue(saved);
      doorActionsScope.resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await doorActionsScope.service.lockDoor(10, doorActionsScope.mockUser);

      expect(result).toBe(saved);
      expect(doorActionsScope.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = doorActionsScope.eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 100,
        usageAction: ResourceUsageAction.DoorLock,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should unlock a door and emit event', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue(doorActionsScope.doorResource);
      const saved = {
        id: 101,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlock,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      doorActionsScope.resourceUsageRepository.save.mockResolvedValue(saved);
      doorActionsScope.resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await doorActionsScope.service.unlockDoor(10, doorActionsScope.mockUser);

      expect(result).toBe(saved);
      expect(doorActionsScope.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = doorActionsScope.eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 101,
        usageAction: ResourceUsageAction.DoorUnlock,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should unlatch a door when supported and emit event', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue({
        ...doorActionsScope.doorResource,
        separateUnlockAndUnlatch: true,
      } as Resource);
      const saved = {
        id: 102,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlatch,
        startTime: new Date(),
        startNotes: null,
        endTime: new Date(),
        endNotes: null,
      } as unknown as ResourceUsage;
      doorActionsScope.resourceUsageRepository.save.mockResolvedValue(saved);
      doorActionsScope.resourceUsageRepository.findOne.mockResolvedValue(saved);

      const result = await doorActionsScope.service.unlatchDoor(10, doorActionsScope.mockUser);

      expect(result).toBe(saved);
      expect(doorActionsScope.eventEmitter.emitAsync).toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.any(Object),
      );

      const emitted = doorActionsScope.eventEmitter.emitAsync.mock.calls[0];
      const payload = emitted[1] as ResourceSessionStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSessionStartedEvent);
      expect(payload.usage).toMatchObject({
        id: 102,
        usageAction: ResourceUsageAction.DoorUnlatch,
        resourceId: 10,
        userId: 5,
      });
    });

    it('should propagate emitAsync errors from door lock', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue(doorActionsScope.doorResource);
      const saved = {
        id: 100,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorLock,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      doorActionsScope.resourceUsageRepository.save.mockResolvedValue(saved);
      doorActionsScope.resourceUsageRepository.findOne.mockResolvedValue(saved);
      doorActionsScope.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(doorActionsScope.service.lockDoor(10, doorActionsScope.mockUser)).rejects.toThrow('Flow error');
    });

    it('should propagate emitAsync errors from door unlock', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue(doorActionsScope.doorResource);
      const saved = {
        id: 101,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlock,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      doorActionsScope.resourceUsageRepository.save.mockResolvedValue(saved);
      doorActionsScope.resourceUsageRepository.findOne.mockResolvedValue(saved);
      doorActionsScope.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(doorActionsScope.service.unlockDoor(10, doorActionsScope.mockUser)).rejects.toThrow('Flow error');
    });

    it('should propagate emitAsync errors from door unlatch', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue({
        ...doorActionsScope.doorResource,
        separateUnlockAndUnlatch: true,
      } as Resource);
      const saved = {
        id: 102,
        resourceId: 10,
        userId: 5,
        usageAction: ResourceUsageAction.DoorUnlatch,
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as ResourceUsage;
      doorActionsScope.resourceUsageRepository.save.mockResolvedValue(saved);
      doorActionsScope.resourceUsageRepository.findOne.mockResolvedValue(saved);
      doorActionsScope.eventEmitter.emitAsync.mockRejectedValueOnce(new Error('Flow error'));

      await expect(doorActionsScope.service.unlatchDoor(10, doorActionsScope.mockUser)).rejects.toThrow('Flow error');
    });

    it('should throw when operating non-door resource', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue({
        ...doorActionsScope.doorResource,
        type: ResourceType.Machine,
      } as Resource);

      await expect(doorActionsScope.service.lockDoor(10, doorActionsScope.mockUser)).rejects.toThrow(
        'Resource is not a door',
      );
      await expect(doorActionsScope.service.unlockDoor(10, doorActionsScope.mockUser)).rejects.toThrow(
        'Resource is not a door',
      );
    });

    it('should throw when unlatching unsupported door', async () => {
      doorActionsScope.resourceRepository.findOne.mockResolvedValue({
        ...doorActionsScope.doorResource,
        separateUnlockAndUnlatch: false,
      } as Resource);

      await expect(doorActionsScope.service.unlatchDoor(10, doorActionsScope.mockUser)).rejects.toThrow(
        'Door (ID: 10, Name: Front Door) does not support unlatching',
      );
    });
  });

  describe('canControllResource (cache)', () => {
    const mockUser: User = { id: 1, systemPermissions: { canManageResources: false } } as User;
    const resourceId = 42;
    const canControllResourceCacheScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get resourceId() {
          return resourceId;
        },
        get mockUser() {
          return mockUser;
        },
        get resourceIntroductionService() {
          return scope.resourceIntroductionService;
        },
        set resourceIntroductionService(value: typeof scope.resourceIntroductionService) {
          scope.resourceIntroductionService = value;
        },
        get mockRbacService() {
          return scope.mockRbacService;
        },
        get resourceIntroducersService() {
          return scope.resourceIntroducersService;
        },
        set resourceIntroducersService(value: typeof scope.resourceIntroducersService) {
          scope.resourceIntroducersService = value;
        },
        get mockResourceRetrainingService() {
          return scope.mockResourceRetrainingService;
        },
      },
      scope,
    );

    beforeEach(() => {
      scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
      scope.resourceIntroducersService.canMaintain.mockResolvedValue(false);
      scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
      scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
      scope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: null,
      });
    });

    it('returns cached result on repeated call without hitting DB again', async () => {
      const first = await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      const second = await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );

      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('caches the RBAC lookup for users without request-scoped permissions', async () => {
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );

      expect(canControllResourceCacheScope.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(1);
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('re-queries DB after TTL expires', async () => {
      jest.useFakeTimers();
      try {
        await canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        );
        jest.advanceTimersByTime(30_001);
        await canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        );

        expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('clears cache on ResourceIntroductionChangedEvent', async () => {
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      canControllResourceCacheScope.service.handleIntroductionChanged();

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent cache misses', async () => {
      let resolveIntroduction!: (value: boolean) => void;
      canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
      );

      const first = canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      const second = canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      await Promise.resolve();
      resolveIntroduction(true);

      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
      expect(canControllResourceCacheScope.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(1);
    });

    it('clears cache on ResourceGroupIntroductionChangedEvent', async () => {
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      canControllResourceCacheScope.service.handleGroupIntroductionChanged();

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('clears only the specific entry on ResourceIntroducerChangedEvent', async () => {
      const otherUser: User = { id: 2, systemPermissions: { canManageResources: false } } as User;
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        otherUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);

      canControllResourceCacheScope.service.handleIntroducerChanged({
        introducerUserId: canControllResourceCacheScope.mockUser.id,
        resourceId: canControllResourceCacheScope.resourceId,
      } as import('../../introducers/events/resource-introducer-changed.event').ResourceIntroducerChangedEvent);

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      // mockUser's entry was cleared; otherUser's entry should still be cached.
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        otherUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(3);
    });

    it('clears cache on ResourceGroupIntroducerChangedEvent', async () => {
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      canControllResourceCacheScope.service.handleGroupIntroducerChanged();

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('clears resource entries on ResourceChangedEvent', async () => {
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      canControllResourceCacheScope.service.handleResourceChanged({
        resourceId: canControllResourceCacheScope.resourceId,
      } as import('../../events/resource-changed.event').ResourceChangedEvent);

      expect(
        // @ts-expect-error access private field for testing
        canControllResourceCacheScope.service.accessCacheKeysByUser.has(canControllResourceCacheScope.mockUser.id),
      ).toBe(false);

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('evicts a plain user authorization grant when their RBAC permissions are revoked', async () => {
      canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
      canControllResourceCacheScope.mockRbacService.getEffectivePermissions
        .mockResolvedValueOnce(new Set(['resources.update']))
        .mockResolvedValueOnce(new Set<string>());

      await expect(
        canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        ),
      ).resolves.toBe(true);

      canControllResourceCacheScope.service.handleUserPermissionsChanged(
        new UserPermissionsChangedEvent(canControllResourceCacheScope.mockUser.id),
      );

      await expect(
        canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        ),
      ).resolves.toBe(false);
      expect(canControllResourceCacheScope.mockRbacService.getEffectivePermissions).toHaveBeenCalledTimes(2);
    });

    it('evicts only the changed user without scanning other authorization entries', async () => {
      const otherUser: User = { id: 2, systemPermissions: { canManageResources: false } } as User;
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        otherUser,
      );

      canControllResourceCacheScope.service.handleUserPermissionsChanged(
        new UserPermissionsChangedEvent(canControllResourceCacheScope.mockUser.id),
      );

      expect(
        // @ts-expect-error access private field for testing
        canControllResourceCacheScope.service.accessCacheKeysByUser.has(canControllResourceCacheScope.mockUser.id),
      ).toBe(false);
      // @ts-expect-error access private field for testing
      expect(canControllResourceCacheScope.service.accessCacheKeysByUser.has(otherUser.id)).toBe(true);
    });

    it('does not share privileged results with a restricted principal', async () => {
      const privilegedUser = {
        ...canControllResourceCacheScope.mockUser,
        effectivePermissions: new Set(['resources.update']),
      } as User;
      const restrictedUser = {
        ...canControllResourceCacheScope.mockUser,
        effectivePermissions: new Set<string>(),
      } as User;
      canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(false);
      canControllResourceCacheScope.resourceIntroducersService.canMaintain.mockResolvedValue(false);

      await expect(
        canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          privilegedUser,
        ),
      ).resolves.toBe(true);
      await expect(
        canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          restrictedUser,
        ),
      ).resolves.toBe(false);
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('does not cache a grant past a future retraining deadline', async () => {
      jest.useFakeTimers();
      try {
        canControllResourceCacheScope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
          blocksAccess: false,
          dueAt: new Date(Date.now() + 1_000),
        });

        await canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        );
        jest.advanceTimersByTime(1_001);
        await canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        );

        expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('caches a grant with an overdue non-blocking retraining policy', async () => {
      canControllResourceCacheScope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
        blocksAccess: false,
        dueAt: new Date(Date.now() - 1_000),
      });

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );

      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('does not cache a lookup that completed after an invalidation', async () => {
      let resolveIntroduction!: (value: boolean) => void;
      canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveIntroduction = resolve)),
      );

      const authorization = canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        {
          ...canControllResourceCacheScope.mockUser,
          effectivePermissions: new Set<string>(),
        } as User,
      );
      await Promise.resolve();
      canControllResourceCacheScope.service.handleIntroductionChanged();
      resolveIntroduction(true);
      await authorization;

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(2);
    });

    it('pruneAccessCache evicts expired entries', async () => {
      jest.useFakeTimers();
      try {
        await canControllResourceCacheScope.service.canControllResource(
          canControllResourceCacheScope.resourceId,
          canControllResourceCacheScope.mockUser,
        );
        jest.advanceTimersByTime(30_001);
        // @ts-expect-error access private method for testing
        canControllResourceCacheScope.service.pruneAccessCache();
        // @ts-expect-error access private field for testing
        expect(canControllResourceCacheScope.service.accessCache.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses cache even when transactionalEntityManager is provided', async () => {
      const fakeTem = {} as import('typeorm').EntityManager;

      // First call (no TEM) populates the cache.
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);

      // Second call WITH a TEM should still hit the cache — no extra DB queries.
      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
        fakeTem,
      );
      expect(canControllResourceCacheScope.resourceIntroductionService.hasValidIntroduction).toHaveBeenCalledTimes(1);
    });

    it('prunes expired entries before adding a new result to a full cache', async () => {
      // @ts-expect-error access private field for testing
      const MAX = canControllResourceCacheScope.service.ACCESS_CACHE_MAX_SIZE as number;
      // @ts-expect-error access private field for testing
      const cache = canControllResourceCacheScope.service.accessCache as Map<string, unknown>;

      // Fill the cache with expired entries so the next result can claim a slot.
      for (let i = 0; i < MAX; i++) {
        cache.set(`stub:${i}`, { userId: i, resourceId: i, result: true, expiresAt: Date.now() - 1 });
      }

      await canControllResourceCacheScope.service.canControllResource(
        canControllResourceCacheScope.resourceId,
        canControllResourceCacheScope.mockUser,
      );

      expect(cache.size).toBe(1);
      expect(
        cache.has(`${canControllResourceCacheScope.mockUser.id}:${canControllResourceCacheScope.resourceId}:default`),
      ).toBe(true);
    });
  });
});
