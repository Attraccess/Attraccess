import { SupervisionMode } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartRejectsAnUnknownSupervisor(scope: SupervisedStartTestScope): void {
  it('rejects an unknown supervisor', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(null);

    await expect(scope.service.startSession(1, scope.requester, {}, { supervisorUserId: 999 })).rejects.toThrow(
      new NotFoundException('Supervisor with ID 999 not found'),
    );
  });
}
