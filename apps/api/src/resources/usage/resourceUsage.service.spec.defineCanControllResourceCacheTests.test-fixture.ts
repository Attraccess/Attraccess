import { User } from '@attraccess/database-entities';
import { registerCanControllResourceCacheReturnsCachedResultOnRepeatedCallWithoutHittingDbAgain } from './resourceUsage.service.can-controll-resource-cache-returns-cached-result-on-repeated-call-without-hitting-db-again.test-cases';
import { registerCanControllResourceCacheCachesTheRbacLookupForUsersWithoutRequestScopedPermissions } from './resourceUsage.service.can-controll-resource-cache-caches-the-rbac-lookup-for-users-without-request-scoped-permissions.test-cases';
import { registerCanControllResourceCacheReQueriesDbAfterTtlExpires } from './resourceUsage.service.can-controll-resource-cache-re-queries-db-after-ttl-expires.test-cases';
import { registerCanControllResourceCacheClearsCacheOnResourceIntroductionChangedEvent } from './resourceUsage.service.can-controll-resource-cache-clears-cache-on-resource-introduction-changed-event.test-cases';
import { registerCanControllResourceCacheCoalescesConcurrentCacheMisses } from './resourceUsage.service.can-controll-resource-cache-coalesces-concurrent-cache-misses.test-cases';
import { registerCanControllResourceCacheClearsCacheOnResourceGroupIntroductionChangedEvent } from './resourceUsage.service.can-controll-resource-cache-clears-cache-on-resource-group-introduction-changed-event.test-cases';
import { registerCanControllResourceCacheClearsOnlyTheSpecificEntryOnResourceIntroducerChangedEvent } from './resourceUsage.service.can-controll-resource-cache-clears-only-the-specific-entry-on-resource-introducer-changed-event.test-cases';
import { registerCanControllResourceCacheClearsCacheOnResourceGroupIntroducerChangedEvent } from './resourceUsage.service.can-controll-resource-cache-clears-cache-on-resource-group-introducer-changed-event.test-cases';
import { registerCanControllResourceCacheClearsResourceEntriesOnResourceChangedEvent } from './resourceUsage.service.can-controll-resource-cache-clears-resource-entries-on-resource-changed-event.test-cases';
import { registerCanControllResourceCacheEvictsAPlainUserAuthorizationGrantWhenTheirRbacPermissionsAreRevoked } from './resourceUsage.service.can-controll-resource-cache-evicts-a-plain-user-authorization-grant-when-their-rbac-permissions-are-revoked.test-cases';
import { registerCanControllResourceCacheEvictsOnlyTheChangedUserWithoutScanningOtherAuthorizationEntries } from './resourceUsage.service.can-controll-resource-cache-evicts-only-the-changed-user-without-scanning-other-authorization-entries.test-cases';
import { registerCanControllResourceCacheDoesNotSharePrivilegedResultsWithARestrictedPrincipal } from './resourceUsage.service.can-controll-resource-cache-does-not-share-privileged-results-with-a-restricted-principal.test-cases';
import { registerCanControllResourceCacheDoesNotCacheAGrantPastAFutureRetrainingDeadline } from './resourceUsage.service.can-controll-resource-cache-does-not-cache-a-grant-past-a-future-retraining-deadline.test-cases';
import { registerCanControllResourceCacheCachesAGrantWithAnOverdueNonBlockingRetrainingPolicy } from './resourceUsage.service.can-controll-resource-cache-caches-a-grant-with-an-overdue-non-blocking-retraining-policy.test-cases';
import { registerCanControllResourceCacheDoesNotCacheALookupThatCompletedAfterAnInvalidation } from './resourceUsage.service.can-controll-resource-cache-does-not-cache-a-lookup-that-completed-after-an-invalidation.test-cases';
import { registerCanControllResourceCachePruneAccessCacheEvictsExpiredEntries } from './resourceUsage.service.can-controll-resource-cache-prune-access-cache-evicts-expired-entries.test-cases';
import { registerCanControllResourceCacheUsesCacheEvenWhenTransactionalEntityManagerIsProvided } from './resourceUsage.service.can-controll-resource-cache-uses-cache-even-when-transactional-entity-manager-is-provided.test-cases';
import { registerCanControllResourceCachePrunesExpiredEntriesBeforeAddingANewResultToAFullCache } from './resourceUsage.service.can-controll-resource-cache-prunes-expired-entries-before-adding-a-new-result-to-a-full-cache.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineCanControllResourceCacheTests(parentScope: ResourceUsageServiceTestScope) {
  const mockUser: User = { id: 1, systemPermissions: { canManageResources: false } } as User;
  const resourceId = 42;
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get resourceId() {
        return resourceId;
      },
      get mockUser() {
        return mockUser;
      },
      get resourceIntroductionService() {
        return parentScope.resourceIntroductionService;
      },
      set resourceIntroductionService(value: typeof parentScope.resourceIntroductionService) {
        parentScope.resourceIntroductionService = value;
      },
      get mockRbacService() {
        return parentScope.mockRbacService;
      },
      get resourceIntroducersService() {
        return parentScope.resourceIntroducersService;
      },
      set resourceIntroducersService(value: typeof parentScope.resourceIntroducersService) {
        parentScope.resourceIntroducersService = value;
      },
      get mockResourceRetrainingService() {
        return parentScope.mockResourceRetrainingService;
      },
    },
    parentScope,
  );

  beforeEach(() => {
    parentScope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    parentScope.resourceIntroducersService.canMaintain.mockResolvedValue(false);
    parentScope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    parentScope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);
    parentScope.mockResourceRetrainingService.getResourceRetrainingStatus.mockResolvedValue({
      blocksAccess: false,
      dueAt: null,
    });
  });
  registerCanControllResourceCacheReturnsCachedResultOnRepeatedCallWithoutHittingDbAgain(scope);

  registerCanControllResourceCacheCachesTheRbacLookupForUsersWithoutRequestScopedPermissions(scope);

  registerCanControllResourceCacheReQueriesDbAfterTtlExpires(scope);

  registerCanControllResourceCacheClearsCacheOnResourceIntroductionChangedEvent(scope);

  registerCanControllResourceCacheCoalescesConcurrentCacheMisses(scope);

  registerCanControllResourceCacheClearsCacheOnResourceGroupIntroductionChangedEvent(scope);

  registerCanControllResourceCacheClearsOnlyTheSpecificEntryOnResourceIntroducerChangedEvent(scope);

  registerCanControllResourceCacheClearsCacheOnResourceGroupIntroducerChangedEvent(scope);

  registerCanControllResourceCacheClearsResourceEntriesOnResourceChangedEvent(scope);

  registerCanControllResourceCacheEvictsAPlainUserAuthorizationGrantWhenTheirRbacPermissionsAreRevoked(scope);

  registerCanControllResourceCacheEvictsOnlyTheChangedUserWithoutScanningOtherAuthorizationEntries(scope);

  registerCanControllResourceCacheDoesNotSharePrivilegedResultsWithARestrictedPrincipal(scope);

  registerCanControllResourceCacheDoesNotCacheAGrantPastAFutureRetrainingDeadline(scope);

  registerCanControllResourceCacheCachesAGrantWithAnOverdueNonBlockingRetrainingPolicy(scope);

  registerCanControllResourceCacheDoesNotCacheALookupThatCompletedAfterAnInvalidation(scope);

  registerCanControllResourceCachePruneAccessCacheEvictsExpiredEntries(scope);

  registerCanControllResourceCacheUsesCacheEvenWhenTransactionalEntityManagerIsProvided(scope);

  registerCanControllResourceCachePrunesExpiredEntriesBeforeAddingANewResultToAFullCache(scope);

  return scope;
}
