import { SupervisionMode } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartRejectsASupervisedStartWhenTheResourceDoesNotAllowSupervision(
  scope: SupervisedStartTestScope,
): void {
  it('rejects a supervised start when the resource does not allow supervision', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.INTRODUCTION_REQUIRED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(scope.supervisor);

    await expect(scope.service.startSession(1, scope.requester, {}, { supervisorUserId: 2 })).rejects.toThrow(
      new BadRequestException('This resource does not support supervised sessions'),
    );
  });
}
