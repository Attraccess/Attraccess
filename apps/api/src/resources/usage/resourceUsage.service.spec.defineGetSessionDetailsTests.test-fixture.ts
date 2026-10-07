import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { registerGetSessionDetailsLoadsTheRequestedVisibleSessionAndItsUsageDetailsForTheOwner } from './resourceUsage.service.get-session-details-loads-the-requested-visible-session-and-its-usage-details-for-the-owner.test-cases';
import { registerGetSessionDetailsAllowsResourceManagersToViewAnotherUserSSession } from './resourceUsage.service.get-session-details-allows-resource-managers-to-view-another-user-s-session.test-cases';
import { registerGetSessionDetailsRequiresProjectAccessBeforeReturningAnotherMemberSUsage } from './resourceUsage.service.get-session-details-requires-project-access-before-returning-another-member-s-usage.test-cases';
import { registerGetSessionDetailsRejectsMissingOrInaccessibleSessionsS } from './resourceUsage.service.get-session-details-rejects-missing-or-inaccessible-sessions-s.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { ResourceUsageServiceTestScope } from './resourceUsage.service.spec';

export function defineGetSessionDetailsTests(parentScope: ResourceUsageServiceTestScope) {
  const requester = { id: 1, effectivePermissions: new Set<string>() } as AuthenticatedUser;
  const scope = inheritTestScope(
    {
      get resourceUsageRepository() {
        return parentScope.resourceUsageRepository;
      },
      set resourceUsageRepository(value: typeof parentScope.resourceUsageRepository) {
        parentScope.resourceUsageRepository = value;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get requester() {
        return requester;
      },
      get projectsService() {
        return parentScope.projectsService;
      },
      set projectsService(value: typeof parentScope.projectsService) {
        parentScope.projectsService = value;
      },
    },
    parentScope,
  );

  registerGetSessionDetailsLoadsTheRequestedVisibleSessionAndItsUsageDetailsForTheOwner(scope);

  registerGetSessionDetailsAllowsResourceManagersToViewAnotherUserSSession(scope);

  registerGetSessionDetailsRequiresProjectAccessBeforeReturningAnotherMemberSUsage(scope);

  registerGetSessionDetailsRejectsMissingOrInaccessibleSessionsS(scope);

  return scope;
}
