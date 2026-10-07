import { ResourceUsage } from '@attraccess/database-entities';
import { GetSessionDetailsTestScope } from './resourceUsage.service.spec';
export function registerGetSessionDetailsAllowsResourceManagersToViewAnotherUserSSession(
  scope: GetSessionDetailsTestScope,
): void {
  it('allows resource managers to view another user’s session', async () => {
    scope.resourceUsageRepository.findOne.mockResolvedValue({ id: 8, userId: 2 } as ResourceUsage);
    expect(
      await scope.service.getSessionDetails(5, 8, {
        ...scope.requester,
        effectivePermissions: new Set(['resources.update']),
      }),
    ).toEqual({ id: 8, userId: 2 });
    expect(scope.projectsService.findOneById).not.toHaveBeenCalled();
  });
}
