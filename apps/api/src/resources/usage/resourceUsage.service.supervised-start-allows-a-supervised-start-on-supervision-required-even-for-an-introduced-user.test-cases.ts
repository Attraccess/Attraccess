import { SupervisionMode } from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartAllowsASupervisedStartOnSupervisionRequiredEvenForAnIntroducedUser(
  scope: SupervisedStartTestScope,
): void {
  it('allows a supervised start on SUPERVISION_REQUIRED even for an introduced user', async () => {
    const dto: StartUsageSessionDto = {};
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_REQUIRED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(scope.supervisor);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);

    scope.mockSuccessfulSessionCreation(2);

    await expect(scope.service.startSession(1, scope.requester, dto, { supervisorUserId: 2 })).resolves.toMatchObject({
      supervisorUserId: 2,
    });
  });
}
