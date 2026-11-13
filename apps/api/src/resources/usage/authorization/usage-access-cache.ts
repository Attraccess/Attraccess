import { User } from '@attraccess/database-entities';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import { Redis } from 'ioredis';

import { EntityManager } from 'typeorm';

import { MetricsService } from '../../../metrics/metrics.service';

import { RbacService } from '../../../users-and-auth/rbac/rbac.service';

import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';

import { VALKEY_CLIENT } from '../../../valkey/valkey.module';

import { ResourceChangedEvent } from '../../events/resource-changed.event';

import { ResourceGroupIntroducerChangedEvent } from '../../groups/introducers/events/resource-group-introducer-changed.event';

import { ResourceGroupIntroductionChangedEvent } from '../../groups/introductions/events/resource-group-introduction-changed.event';

import { ResourceIntroducerChangedEvent } from '../../introducers/events/resource-introducer-changed.event';

import { ResourceIntroductionChangedEvent } from '../../introductions/events/resource-introduction-changed.event';

import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';

import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
  type AuthorizationCacheInvalidationMessage,
} from '../../../users-and-auth/rbac/authorization-cache-invalidation';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { UsageAccessRules } from './usage-access-rules';

type AccessCacheEntry = { userId: number; resourceId: number; result: boolean; expiresAt: number };

/**
 * The one cache of "may this user control this resource" answers. It is invalidated by local change events and,
 * with Valkey, by permission changes on other API instances.
 */
@Injectable()
export class UsageAccessCache {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  private readonly accessCache = new Map<string, AccessCacheEntry>();

  private readonly accessCacheKeysByUser = new Map<number, Set<string>>();

  private readonly accessCacheInFlight = new Map<string, { generation: number; result: Promise<boolean> }>();

  private readonly ACCESS_CACHE_TTL_MS = 30_000;

  private readonly ACCESS_CACHE_MAX_SIZE = 5_000;

  private cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

  private authorizationCacheSubscriber: Redis | null = null;

  private accessCacheGeneration = 0;

  constructor(
    private readonly rules: UsageAccessRules,
    private readonly resourceRetrainingService: ResourceRetrainingService,
    private readonly metricsService: MetricsService,
    private readonly rbacService: RbacService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(VALKEY_CLIENT) private readonly valkeyClient: Redis | null,
  ) {}

  async canControllResource(
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

  private invalidateAccessCache(predicate?: (entry: { userId: number; resourceId: number }) => boolean): void {
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

  private invalidateUserAccessCache(userId: number): void {
    this.accessCacheGeneration += 1;
    for (const key of this.accessCacheKeysByUser.get(userId) ?? []) {
      this.deleteAccessCacheEntry(key);
    }
    this.metricsService.authorizationCacheSize.set(this.accessCache.size);
  }

  private async resolveAuthorizationCacheMiss(
    key: string,
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    transactionalEntityManager: EntityManager | undefined,
    generation: number,
  ): Promise<boolean> {
    const result = await this.rules.canControl(resourceId, user, canUpdateResource, transactionalEntityManager);
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

  startCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => this.pruneAccessCache(), 60_000);
  }

  stopCleanup(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  /** Permission changes on other API instances arrive through Valkey and invalidate this cache too. */
  async subscribe(): Promise<void> {
    if (!this.valkeyClient) {
      return;
    }
    this.authorizationCacheSubscriber = this.valkeyClient.duplicate();
    // ioredis emits `error` on every reconnect attempt; log each outage once, and only the message: AUTH errors
    // carry the password in `error.command.args`.
    let disconnected = false;
    this.authorizationCacheSubscriber.on('error', (error: NodeJS.ErrnoException) => {
      if (disconnected) {
        return;
      }
      disconnected = true;
      this.logger.warn(
        `Authorization cache invalidation subscriber lost its Valkey connection (${error.message || error.code}); ` +
          'permission changes on other API instances are not seen until it reconnects (cached answers still expire ' +
          `within ${this.ACCESS_CACHE_TTL_MS / 1000} s)`,
      );
    });
    this.authorizationCacheSubscriber.on('ready', () => {
      if (!disconnected) {
        return;
      }
      disconnected = false;
      this.logger.log('Authorization cache invalidation subscriber reconnected to Valkey');
    });
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

  unsubscribe(): void {
    this.authorizationCacheSubscriber?.disconnect();
    this.authorizationCacheSubscriber = null;
  }

  private deleteAccessCacheEntry(key: string): void {
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

  private setAccessCacheEntry(key: string, entry: AccessCacheEntry): void {
    this.accessCache.set(key, entry);
    const keys = this.accessCacheKeysByUser.get(entry.userId) ?? new Set<string>();
    keys.add(key);
    this.accessCacheKeysByUser.set(entry.userId, keys);
  }

  private pruneAccessCache(): void {
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
