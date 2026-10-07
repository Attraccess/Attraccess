import { Project, ResourceUsage } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { GetSessionDetailsTestScope } from './resourceUsage.service.spec';
export function registerGetSessionDetailsRequiresProjectAccessBeforeReturningAnotherMemberSUsage(
  scope: GetSessionDetailsTestScope,
): void {
  it('requires project access before returning another member’s usage', async () => {
    const usage = { id: 8, userId: 2, projectId: 3 } as ResourceUsage;
    scope.resourceUsageRepository.findOne.mockResolvedValue(usage);
    scope.projectsService.findOneById.mockResolvedValue({ id: 3 } as Project);
    expect(await scope.service.getSessionDetails(5, 8, scope.requester)).toBe(usage);
    expect(scope.projectsService.findOneById).toHaveBeenCalledWith(1, 3);
    scope.projectsService.findOneById.mockRejectedValue(new NotFoundException('Project not found'));
    await expect(scope.service.getSessionDetails(5, 8, scope.requester)).rejects.toThrow(NotFoundException);
  });
}
