import { SupervisionMode } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartBlocksASoloStartOnSupervisionRequiredEvenForAnIntroducedUser(
  scope: SupervisedStartTestScope,
): void {
  it('blocks a solo start on SUPERVISION_REQUIRED even for an introduced user', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_REQUIRED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);

    await expect(scope.service.startSession(1, scope.requester, {})).rejects.toThrow(
      new BadRequestException('This resource requires a supervisor; request a supervised session instead'),
    );
  });
}
