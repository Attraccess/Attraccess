import { ResourceUsage } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { GetSessionDetailsTestScope } from './resourceUsage.service.spec';
export function registerGetSessionDetailsRejectsMissingOrInaccessibleSessionsS(
  scope: GetSessionDetailsTestScope,
): void {
  it.each([null, { id: 8, userId: 2, projectId: null }])(
    'rejects missing or inaccessible sessions (%s)',
    async (usage) => {
      scope.resourceUsageRepository.findOne.mockResolvedValue(usage as ResourceUsage);
      await expect(scope.service.getSessionDetails(5, 8, scope.requester)).rejects.toThrow(NotFoundException);
    },
  );
}
