import { SupervisionMode } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartRejectsSelfSupervision(scope: SupervisedStartTestScope): void {
  it('rejects self-supervision', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);

    await expect(
      scope.service.startSession(1, scope.requester, {}, { supervisorUserId: scope.requester.id }),
    ).rejects.toThrow(new BadRequestException('You cannot supervise your own session'));
  });
}
