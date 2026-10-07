import { ResourceUsage } from '@attraccess/database-entities';
import { GetSessionDetailsTestScope } from './resourceUsage.service.spec';
export function registerGetSessionDetailsLoadsTheRequestedVisibleSessionAndItsUsageDetailsForTheOwner(
  scope: GetSessionDetailsTestScope,
): void {
  it('loads the requested visible session and its usage details for the owner', async () => {
    const usage = { id: 8, userId: 1, resourceId: 5 } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(usage);
    expect(await scope.service.getSessionDetails(5, 8, scope.requester)).toBe(usage);
    expect(scope.resourceUsageRepository.findOne).toHaveBeenCalledWith({
      where: { id: 8, resourceId: 5, lifecyclePending: false },
      relations: expect.arrayContaining(['project', 'supervisorUser', 'formSubmissions.form']),
    });
    expect(scope.projectsService.findOneById).not.toHaveBeenCalled();
  });
}
