import { User } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { EntityManager } from 'typeorm';
import { UsageAccessCacheInvalidationImplementation } from './usage-access-cache-invalidation';
export abstract class UsageControlPermissionsImplementation extends UsageAccessCacheInvalidationImplementation {
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
}
