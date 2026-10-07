import { Resource, User } from '@attraccess/database-entities';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { OnEvent } from '@nestjs/event-emitter';
import { EntityManager } from 'typeorm';
import { UserPermissionsChangedEvent } from '../../users-and-auth/rbac/events/user-permissions-changed.event';
import { ResourceChangedEvent } from '../events/resource-changed.event';
import { ResourceGroupIntroducerChangedEvent } from '../groups/introducers/events/resource-group-introducer-changed.event';
import { ResourceGroupIntroductionChangedEvent } from '../groups/introductions/events/resource-group-introduction-changed.event';
import { ResourceIntroducerChangedEvent } from '../introducers/events/resource-introducer-changed.event';
import { ResourceIntroductionChangedEvent } from '../introductions/events/resource-introduction-changed.event';
import { UsageAccessCacheLifecycleImplementation } from './usage-access-cache-lifecycle';
export abstract class UsageAccessCacheInvalidationImplementation extends UsageAccessCacheLifecycleImplementation {
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
}
