import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
  type AuthorizationCacheInvalidationMessage,
} from '../../users-and-auth/rbac/authorization-cache-invalidation';
import { UserPermissionsChangedEvent } from '../../users-and-auth/rbac/events/user-permissions-changed.event';
import { UsageLifecycleDraftsImplementation } from './usage-lifecycle-drafts';
export abstract class UsageAccessCacheLifecycleImplementation extends UsageLifecycleDraftsImplementation {
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
