import { FormSubmission, Resource, ResourceUsage, User, SupervisionMode } from '@attraccess/database-entities';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../../exceptions/resource.maintenance.inUse.exception';

import { ResourceNotFoundException } from '../../../exceptions/resource.notFound.exception';

import { ResourceUnhealthyException } from '../../../exceptions/resource.unhealthy.exception';

import { AuthenticatedUser, SystemEvent } from '@attraccess/plugins-backend-sdk';

import { OnEvent } from '@nestjs/event-emitter';

import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';

import { ResourceChangedEvent } from '../../events/resource-changed.event';

import { ResourceGroupIntroducerChangedEvent } from '../../groups/introducers/events/resource-group-introducer-changed.event';

import { ResourceGroupIntroductionChangedEvent } from '../../groups/introductions/events/resource-group-introduction-changed.event';

import { ResourceIntroducerChangedEvent } from '../../introducers/events/resource-introducer-changed.event';

import { ResourceIntroductionChangedEvent } from '../../introductions/events/resource-introduction-changed.event';

import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
  type AuthorizationCacheInvalidationMessage,
} from '../../../users-and-auth/rbac/authorization-cache-invalidation';

import { UsageLifecycle } from '../lifecycle/usage-lifecycle';

export abstract class UsageAuthorization extends UsageLifecycle {
  protected async getResource(
    resourceId: number,
    user: User,
    opts: { checkMaintenance: boolean; checkControlPermission: boolean },
    transactionalEntityManager?: EntityManager,
  ): Promise<Resource> {
    const { checkMaintenance, checkControlPermission } = opts;

    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;

    const resource = await resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      this.logger.warn(`Resource ${resourceId} not found`);
      throw new ResourceNotFoundException(resourceId);
    }
    this.logger.debug(`Found resource ${resourceId}: ${resource.name}`);

    if (checkMaintenance) {
      // Single enforcement point for maintenance mode: only users who can manage maintenance
      // may start a session (or lock/unlock door, etc.). Applies to both manual and
      // schedule-triggered maintenances (see hasActiveMaintenance).
      const hasActiveMaintenance = await this.resourceMaintenanceService.hasActiveMaintenance(
        resourceId,
        transactionalEntityManager,
      );
      if (hasActiveMaintenance) {
        // Check if user can manage maintenance (which allows them to use during maintenance)
        const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(
          user,
          resourceId,
          transactionalEntityManager,
        );

        if (!canManageMaintenance) {
          this.logger.warn(
            `User ${user.id} attempted to use resource ${resourceId} during maintenance window without permissions`,
          );
          throw new ResourceUsageImpossibleMaintenanceInProgressException(resourceId);
        }

        this.logger.debug(`User ${user.id} has maintenance permissions, allowing usage during maintenance window`);
      }

      // Health gate: block non-maintenance users when any health entry is unhealthy.
      // Users that can manage maintenance are intentionally allowed through so they can investigate/repair.
      const isUnhealthy = await this.resourceHealthService.isResourceUnhealthy(resourceId);
      if (isUnhealthy) {
        const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(
          user,
          resourceId,
          transactionalEntityManager,
        );
        if (!canManageMaintenance) {
          this.logger.warn(`User ${user.id} blocked from resource ${resourceId} because it is currently unhealthy`);
          throw new ResourceUnhealthyException(resourceId);
        }
        this.logger.debug(
          `User ${user.id} has maintenance permissions, allowing usage despite unhealthy state on resource ${resourceId}`,
        );
      }
    }

    if (checkControlPermission) {
      const canStartSession = await this.canControllResource(resourceId, user, transactionalEntityManager);

      if (!canStartSession) {
        this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
        throw new BadRequestException('You must complete the resource introduction before using it');
      }
    }

    return resource;
  }

  protected getResourceUsageFlowPayload(resourceUsage: ResourceUsage, formSubmissions?: FormSubmission[]) {
    const normalizedFormSubmissions = formSubmissions ?? [];
    const mappedFormSubmissions: {
      [key: string]: { formName: string; answers: { [key: number]: { value: string; name: string } } };
    } = {};

    normalizedFormSubmissions.forEach((submission) => {
      mappedFormSubmissions[submission.form.id] = {
        formName: submission.form.name,
        answers: Object.fromEntries(
          Object.values(submission.data).map((field) => [
            field.fieldDefinition.id,
            { value: field.value, name: field.fieldDefinition.name },
          ]),
        ),
      };
    });

    const usageUser =
      resourceUsage.user ??
      (resourceUsage.userId != null ? ({ id: resourceUsage.userId } as Pick<User, 'id'> & Partial<User>) : undefined);

    const sanitizedUser: (Partial<User> & Pick<User, 'id'>) | undefined = usageUser
      ? {
          id: usageUser.id,
          username: usageUser.username,
          email: usageUser.email,
          createdAt: usageUser.createdAt,
          updatedAt: usageUser.updatedAt,
          billingFactor: usageUser.billingFactor,
          creditBalance: usageUser.creditBalance,
        }
      : undefined;

    const flowPayload = {
      ...resourceUsage,
      resource: {
        ...resourceUsage.resource,
        documentationMarkdown: undefined,
        documentationUrl: undefined,
        documentationType: undefined,
        metadata: resourceUsage.resource?.metadata ?? null,
      } as Partial<Resource>,
      user: sanitizedUser,
      formSubmissions: mappedFormSubmissions,
    };

    return flowPayload;
  }

  /**
   * Validates that a supervised start is permissible for the given resource and supervisor.
   *
   * Throws when:
   * - the resource does not allow supervision (supervisionMode is INTRODUCTION_REQUIRED),
   * - the requester selected themselves as supervisor,
   * - the supervisor does not exist,
   * - the supervisor is not an introducer for the resource.
   *
   * Does NOT check the requester's own introduction status: a supervised start exists precisely to
   * let a non-introduced user start under a qualified supervisor.
   */
  public async validateSupervisedStart(
    resourceId: number,
    requester: User,
    supervisorUserId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<void> {
    await this.assertSupportsSupervision(resourceId, transactionalEntityManager, preloadedResource);

    if (supervisorUserId === requester.id) {
      throw new BadRequestException('You cannot supervise your own session');
    }

    const userRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(User)
      : this.userRepository;

    const supervisor = await userRepository.findOne({ where: { id: supervisorUserId } });
    if (!supervisor) {
      throw new NotFoundException(`Supervisor with ID ${supervisorUserId} not found`);
    }

    const supervisorIsIntroducer = await this.resourceIntroducersService.isIntroducer(
      resourceId,
      supervisorUserId,
      true,
      transactionalEntityManager,
    );

    if (!supervisorIsIntroducer) {
      throw new ForbiddenException('The selected supervisor is not authorized to supervise this resource');
    }
  }

  /**
   * Resolves the resource and asserts its supervisionMode permits supervised sessions at all.
   * Split out of {@link validateSupervisedStart} because the reader-armed flow (ATT-816) has no
   * named supervisor to validate yet — any eligible one may show up and tap.
   */
  public async assertSupportsSupervision(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<Resource> {
    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;

    const resource = preloadedResource ?? (await resourceRepository.findOne({ where: { id: resourceId } }));
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    if (
      resource.supervisionMode !== SupervisionMode.SUPERVISION_ALLOWED &&
      resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED
    ) {
      throw new BadRequestException('This resource does not support supervised sessions');
    }

    return resource;
  }

  public async canControllResource(
    resourceId: number,
    user: User,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const requestPermissions = (user as AuthenticatedUser).effectivePermissions;
    // API tokens may have a narrower effective permission set than their owning user session.
    // Keep users without request-scoped permissions separate so their RBAC lookup can be cached too.
    const key = `${user.id}:${resourceId}:${
      requestPermissions ? (requestPermissions.has('resources.update') ? 'update' : 'restricted') : 'default'
    }`;
    const cached = this.accessCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.metricsService.authorizationCacheRequestsTotal.inc({ result: 'hit' });
      return cached.result;
    }
    if (cached) {
      this.deleteAccessCacheEntry(key);
    }

    this.metricsService.authorizationCacheRequestsTotal.inc({ result: 'miss' });
    const generation = this.accessCacheGeneration;
    const inFlight = this.accessCacheInFlight.get(key);
    if (inFlight?.generation === generation) {
      return inFlight.result;
    }

    const result = (async () => {
      const canUpdateResource = (requestPermissions ?? (await this.rbacService.getEffectivePermissions(user.id))).has(
        'resources.update',
      );
      return this.resolveAuthorizationCacheMiss(
        key,
        resourceId,
        user,
        canUpdateResource,
        transactionalEntityManager,
        generation,
      );
    })();
    this.accessCacheInFlight.set(key, { generation, result });
    try {
      return await result;
    } finally {
      if (this.accessCacheInFlight.get(key)?.result === result) {
        this.accessCacheInFlight.delete(key);
      }
    }
  }

  protected async canControllResourceUncached(
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    if (canUpdateResource) {
      return true;
    }

    if (await this.resourceIntroductionService.hasValidIntroduction(resourceId, user.id, transactionalEntityManager)) {
      if (!(await this.resourceRetrainingService.isResourceIntroductionBlocked(resourceId, user.id))) {
        this.logger.debug(`User ${user.id} has valid introduction for resource ${resourceId}`);
        return true;
      }
      this.logger.debug(`User ${user.id} introduction for resource ${resourceId} is blocked pending retraining`);
    }

    if (await this.resourceIntroducersService.canMaintain(resourceId, user.id, true, transactionalEntityManager)) {
      this.logger.debug(`User ${user.id} is an introducer or maintainer for resource ${resourceId}`);
      return true;
    }

    const groupsOfResource = await this.resourceGroupsService.getGroupsOfResource(
      resourceId,
      transactionalEntityManager,
    );
    for (const group of groupsOfResource) {
      if (
        await this.resourceGroupsIntroductionsService.hasValidIntroduction(
          { groupId: group.id, userId: user.id },
          transactionalEntityManager,
        )
      ) {
        if (!(await this.resourceRetrainingService.isGroupIntroductionBlocked(group.id, user.id))) {
          this.logger.debug(`User ${user.id} has valid group introduction for resource ${resourceId}`);
          return true;
        }
        this.logger.debug(
          `User ${user.id} group introduction (${group.id}) for resource ${resourceId} is blocked pending retraining`,
        );
      }
    }

    this.logger.debug(`User ${user.id} cannot control resource ${resourceId}`);
    return false;
  }

  protected invalidateAccessCache(predicate?: (entry: { userId: number; resourceId: number }) => boolean): void {
    this.accessCacheGeneration += 1;
    if (predicate) {
      for (const [key, entry] of this.accessCache) {
        if (predicate(entry)) {
          this.deleteAccessCacheEntry(key);
        }
      }
    } else {
      this.accessCache.clear();
      this.accessCacheKeysByUser.clear();
    }
    this.metricsService.authorizationCacheSize.set(this.accessCache.size);
  }

  protected invalidateUserAccessCache(userId: number): void {
    this.accessCacheGeneration += 1;
    for (const key of this.accessCacheKeysByUser.get(userId) ?? []) {
      this.deleteAccessCacheEntry(key);
    }
    this.metricsService.authorizationCacheSize.set(this.accessCache.size);
  }

  protected async resolveAuthorizationCacheMiss(
    key: string,
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    transactionalEntityManager: EntityManager | undefined,
    generation: number,
  ): Promise<boolean> {
    const result = await this.canControllResourceUncached(
      resourceId,
      user,
      canUpdateResource,
      transactionalEntityManager,
    );
    let expiresAt = Date.now() + this.ACCESS_CACHE_TTL_MS;
    if (result && !canUpdateResource) {
      const retrainingStatus = await this.resourceRetrainingService.getResourceRetrainingStatus(resourceId, user.id);
      if (retrainingStatus.dueAt && retrainingStatus.dueAt.getTime() > Date.now()) {
        expiresAt = Math.min(expiresAt, retrainingStatus.dueAt.getTime());
      }
    }
    if (generation === this.accessCacheGeneration && expiresAt > Date.now()) {
      if (this.accessCache.size >= this.ACCESS_CACHE_MAX_SIZE) {
        this.pruneAccessCache();
      }
      if (this.accessCache.size < this.ACCESS_CACHE_MAX_SIZE) {
        this.setAccessCacheEntry(key, { userId: user.id, resourceId, result, expiresAt });
        this.metricsService.authorizationCacheSize.set(this.accessCache.size);
      }
    }
    return result;
  }

  @OnEvent(ResourceIntroductionChangedEvent.EVENT_NAME)
  handleIntroductionChanged(): void {
    // Cannot cheaply map introductionId → (userId, resourceId) without a DB query, so clear all.
    this.invalidateAccessCache();
  }

  @OnEvent(ResourceGroupIntroductionChangedEvent.EVENT_NAME)
  handleGroupIntroductionChanged(): void {
    // Cannot cheaply map resourceGroupId → affected (userId, resourceId) pairs, so clear all.
    this.invalidateAccessCache();
  }

  @OnEvent(ResourceGroupIntroducerChangedEvent.EVENT_NAME)
  handleGroupIntroducerChanged(): void {
    // A group-level role applies to every resource in the group.
    this.invalidateAccessCache();
  }

  @OnEvent(ResourceIntroducerChangedEvent.EVENT_NAME)
  handleIntroducerChanged(event: ResourceIntroducerChangedEvent): void {
    this.invalidateAccessCache(
      (entry) => entry.userId === event.introducerUserId && entry.resourceId === event.resourceId,
    );
  }

  @OnEvent(ResourceChangedEvent.EVENT_NAME)
  handleResourceChanged(event: ResourceChangedEvent): void {
    this.invalidateAccessCache((entry) => entry.resourceId === event.resourceId);
  }

  @OnEvent(UserPermissionsChangedEvent.EVENT_NAME)
  handleUserPermissionsChanged(event: UserPermissionsChangedEvent): void {
    if (event.userId === undefined) {
      this.invalidateAccessCache();
      return;
    }
    this.invalidateUserAccessCache(event.userId);
  }

  protected emitSystemUsageEvent(
    event: SystemEvent.RESOURCE_USAGE_STARTED | SystemEvent.RESOURCE_USAGE_ENDED,
    resource: Resource | undefined,
    user: User | undefined,
  ): void {
    if (!resource || !user) {
      return;
    }
    try {
      this.pluginEvents.emit(event, { resource, user });
    } catch (error) {
      this.logger.error(`Failed to emit plugin SystemEvent ${event}`, (error as Error).stack);
    }
  }

  async onModuleInit(): Promise<void> {
    await this.recoverInterruptedLifecycles();
    this.cacheCleanupInterval = setInterval(() => this.pruneAccessCache(), 60_000);
    if (!this.valkeyClient) {
      return;
    }
    this.authorizationCacheSubscriber = this.valkeyClient.duplicate();
    this.authorizationCacheSubscriber.on('message', (channel, message) => {
      if (channel !== AUTHORIZATION_CACHE_INVALIDATION_CHANNEL) {
        return;
      }
      try {
        const event = JSON.parse(message) as AuthorizationCacheInvalidationMessage;
        if (event.source !== authorizationCacheInvalidationSource) {
          this.eventEmitter.emit(UserPermissionsChangedEvent.EVENT_NAME, new UserPermissionsChangedEvent(event.userId));
        }
      } catch (error) {
        this.logger.warn('Ignoring invalid authorization cache invalidation message', error);
      }
    });
    try {
      await this.authorizationCacheSubscriber.subscribe(AUTHORIZATION_CACHE_INVALIDATION_CHANNEL);
    } catch (error) {
      this.logger.error('Failed to subscribe to authorization cache invalidations', error);
      this.authorizationCacheSubscriber.disconnect();
      this.authorizationCacheSubscriber = null;
    }
  }

  onModuleDestroy(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.authorizationCacheSubscriber?.disconnect();
    this.authorizationCacheSubscriber = null;
  }

  protected deleteAccessCacheEntry(key: string): void {
    const entry = this.accessCache.get(key);
    if (!entry) {
      return;
    }
    this.accessCache.delete(key);
    const keys = this.accessCacheKeysByUser.get(entry.userId);
    keys?.delete(key);
    if (keys?.size === 0) {
      this.accessCacheKeysByUser.delete(entry.userId);
    }
  }

  protected setAccessCacheEntry(
    key: string,
    entry: { userId: number; resourceId: number; result: boolean; expiresAt: number },
  ): void {
    this.accessCache.set(key, entry);
    const keys = this.accessCacheKeysByUser.get(entry.userId) ?? new Set<string>();
    keys.add(key);
    this.accessCacheKeysByUser.set(entry.userId, keys);
  }

  protected pruneAccessCache(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, entry] of this.accessCache) {
      if (entry.expiresAt <= now) {
        this.deleteAccessCacheEntry(key);
        changed = true;
      }
    }
    if (changed) {
      this.metricsService.authorizationCacheSize.set(this.accessCache.size);
    }
  }
}
