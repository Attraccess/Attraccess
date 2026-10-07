import { SupervisionMode } from '@attraccess/database-entities';
import { ForbiddenException } from '@nestjs/common';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartRejectsAMaintainerWhoIsNotAlsoAnIntroducer(
  scope: SupervisedStartTestScope,
): void {
  it('rejects a maintainer who is not also an introducer', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(scope.supervisor);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);

    await expect(scope.service.startSession(1, scope.requester, {}, { supervisorUserId: 2 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
}
